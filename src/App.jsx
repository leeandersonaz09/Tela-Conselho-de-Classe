import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import "./App.css";

function App() {
  // Estados Globais
  const [allStudents, setAllStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [disciplinesOrder, setDisciplinesOrder] = useState([]);

  // Estados de Controle
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTurma, setSelectedTurma] = useState("todas");
  const [mediaCorte, setMediaCorte] = useState(6.0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isSimpleFormat, setIsSimpleFormat] = useState(false);
  const [showStages, setShowStages] = useState(true);

  // NOVOS ESTADOS para controlar a visibilidade das colunas de nota final
  const [showExameFinal, setShowExameFinal] = useState(true);
  const [showMediaFinal, setShowMediaFinal] = useState(true);

  // Filtros
  const [selectedDisciplines, setSelectedDisciplines] = useState([]);
  const [disciplineFilterOpen, setDisciplineFilterOpen] = useState(false);
  const [highlightStages, setHighlightStages] = useState(false);

  // Modal de Foto
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImgSrc, setModalImgSrc] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);

  // --- HANDLERS DRAG AND DROP ---
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;

    if (files && files.length > 0) {
      handleFileUpload({ target: { files: files } });
    }
  };

  // --- HANDLER DE ARQUIVO UNIFICADO ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg("");
    setAllStudents([]);
    // Resetar estados de exibição ao carregar novo arquivo
    setIsSimpleFormat(false);
    setShowStages(true);

    // NOTA: showExameFinal/showMediaFinal serão definidos em processData

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        processData(data);
      } catch (err) {
        console.error(err);
        setErrorMsg("Erro ao ler o arquivo. Verifique se é um Excel válido.");
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const processData = (values) => {
    if (!values || values.length < 2) {
      setErrorMsg("A planilha parece estar vazia.");
      setLoading(false);
      return;
    }

    const headers = values[0].map((h) => String(h).trim().toLowerCase());

    const COL_ALUNO_ID = headers.indexOf("cd_aluno");
    const COL_NOME = headers.indexOf("nm_pessoa");
    const COL_FOTO = headers.indexOf("ds_link_foto");
    const COL_DISCIPLINA = headers.indexOf("disciplina");

    // Mapeia colunas de notas de etapa
    const COL_ETAPA1 = headers.indexOf("nota_d1");
    const COL_ETAPA2 = headers.indexOf("nota_d2");
    const COL_ETAPA3 = headers.indexOf("nota_d3");

    // Retrocompatibilidade para notas de etapas antigas
    const COL_NOTA1 = COL_ETAPA1 > -1 ? COL_ETAPA1 : headers.indexOf("nota");
    const COL_NOTA2 = COL_ETAPA2 > -1 ? COL_ETAPA2 : headers.indexOf("rec");
    const COL_NOTA3 = COL_ETAPA3;

    // Mapeamos TODAS as colunas de nota final disponíveis
    const COL_MEDIA = headers.indexOf("media");
    const COL_MEDIA_FINAL = headers.indexOf("mediafinal");
    const COL_EXAME_FINAL = headers.indexOf("notaexame");

    const COL_TURMA = headers.findIndex(
      (h) => h === "ds_turma" || h === "turma"
    );

    if (COL_ALUNO_ID === -1 || COL_NOME === -1) {
      setErrorMsg("Faltando colunas essenciais: cd_aluno, nm_pessoa.");
      setLoading(false);
      return;
    }

    // --- LÓGICA DE DETECÇÃO DO FORMATO SIMPLES/EF ---
    const isSimple =
      COL_ETAPA1 === -1 && COL_ETAPA2 === -1 && COL_ETAPA3 === -1;
    setIsSimpleFormat(isSimple);

    // Definição do estado inicial de exibição das colunas:
    // 1. Mostrar/Esconder Etapas: Automático
    setShowStages(!isSimple);

    // 2. Mostrar/Esconder Notas Finais: Define o estado inicial para refletir o conteúdo da planilha
    // Se a planilha tiver a coluna, mostramos ela por padrão.
    setShowExameFinal(COL_EXAME_FINAL > -1);
    setShowMediaFinal(COL_MEDIA > -1 || COL_MEDIA_FINAL > -1);

    const studentsMap = {};
    const discOrderTemp = [];
    const turmasSet = new Set();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[COL_ALUNO_ID]) continue;

      const studentId = String(row[COL_ALUNO_ID]).trim();
      const turmaName =
        COL_TURMA > -1 ? String(row[COL_TURMA] || "Geral").trim() : "Geral";
      if (turmaName) turmasSet.add(turmaName);

      if (!studentsMap[studentId]) {
        // --- LÓGICA DA FOTO ---
        let thumbUrl =
          COL_FOTO > -1 && row[COL_FOTO] ? String(row[COL_FOTO]).trim() : "";
        let fullUrl = thumbUrl;

        if (thumbUrl.includes("width=")) {
          fullUrl = thumbUrl
            .replace(/&width=\d+/i, "&width=600")
            .replace(/&height=\d+/i, "&height=875");
        }

        studentsMap[studentId] = {
          id: studentId,
          name: String(row[COL_NOME]).trim(),
          photoUrl: thumbUrl,
          fullPhotoUrl: fullUrl,
          turma: turmaName,
          grades: {},
        };
      }

      let disciplina =
        COL_DISCIPLINA > -1 ? String(row[COL_DISCIPLINA] || "").trim() : "";
      disciplina = disciplina.replace(/^"|"$/g, "");
      let disciplinaKey = disciplina.toUpperCase();

      if (!disciplinaKey || disciplinaKey === "---") continue;

      if (!discOrderTemp.includes(disciplinaKey)) {
        discOrderTemp.push(disciplinaKey);
      }

      // Encontra a MF Original (prioriza media, depois mediafinal)
      let mfOriginalValue =
        COL_MEDIA > -1
          ? row[COL_MEDIA]
          : COL_MEDIA_FINAL > -1
          ? row[COL_MEDIA_FINAL]
          : "";

      studentsMap[studentId].grades[disciplinaKey] = {
        etapa1: COL_NOTA1 > -1 ? row[COL_NOTA1] : "",
        etapa2: COL_NOTA2 > -1 ? row[COL_NOTA2] : "",
        etapa3: COL_NOTA3 > -1 ? row[COL_NOTA3] : "",
        // Armazena as duas notas finais separadamente
        mf_original: mfOriginalValue,
        mf_exame: COL_EXAME_FINAL > -1 ? row[COL_EXAME_FINAL] : "",
        // Define a nota principal (mf) que será usada para FILTRAGEM e STATUS (usamos a nota visível)
        mf: COL_EXAME_FINAL > -1 ? row[COL_EXAME_FINAL] : mfOriginalValue,
      };
    }

    setDisciplinesOrder(discOrderTemp);

    // --- SELEÇÃO INTELIGENTE ---
    const ignoreList = ["EDF", "PV", "SOESP", "ART.P"];

    const initialSelected = discOrderTemp.filter(
      (d) => !ignoreList.some((ignored) => d.includes(ignored))
    );

    setSelectedDisciplines(initialSelected);
    setTurmas(Array.from(turmasSet).sort());
    setAllStudents(Object.values(studentsMap));
    setLoading(false);
  };

  // --- EFEITO DE FILTRO (COMPARADOR) ---
  useEffect(() => {
    if (allStudents.length === 0) {
      setFilteredStudents([]);
      return;
    }

    let temp = allStudents;

    // 1. Filtro Turma
    if (selectedTurma !== "todas") {
      temp = temp.filter((s) => s.turma === selectedTurma);
    }

    // 2. Filtro de Notas
    temp = temp.filter((student) => {
      if (!student.grades) return false;

      // O aluno só aparece se tiver ALGUMA nota vermelha ou falta de nota
      return selectedDisciplines.some((subject) => {
        const subjectKey = subject.toUpperCase();
        const gradeInfo = student.grades[subjectKey];

        if (!gradeInfo) return true;

        let gradeToCheck = null;

        // PRIORIDADE PARA FILTRAGEM:
        // 1. Tenta Exame Final, se estiver visível
        if (showExameFinal) {
          gradeToCheck = gradeInfo.mf_exame;
        } else if (showMediaFinal) {
          // 2. Tenta Média Final Original, se estiver visível
          gradeToCheck = gradeInfo.mf_original;
        }

        if (gradeToCheck === null) return false; // Nenhuma coluna de nota final está visível

        const mfStr = String(gradeToCheck).replace(",", ".").trim();
        const mf = parseFloat(mfStr);

        // Se a nota for vazia, inválida ou MENOR que o corte -> MOSTRA O ALUNO
        if (mfStr === "---" || mfStr === "" || isNaN(mf) || mf < mediaCorte) {
          return true;
        }

        return false;
      });
    });

    temp.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredStudents(temp);
    setCurrentIndex(0);
  }, [
    allStudents,
    selectedTurma,
    mediaCorte,
    selectedDisciplines,
    showExameFinal,
    showMediaFinal,
  ]); // NOVAS DEPENDÊNCIAS

  // --- FORMATAÇÃO DE NOTAS ---
  const formatGrade = (value, applyRedClass) => {
    if (value === undefined || value === null)
      return { value: "-", className: "grade-blank" };

    const str = String(value).replace(",", ".").trim();
    const num = parseFloat(str);

    if (str === "---" || str === "" || isNaN(num)) {
      return {
        value: <span className="grade-blank">-</span>,
        className: "grade-blank",
      };
    }

    const displayVal = num.toFixed(1).replace(".", ",");
    let className = "";

    if (applyRedClass && num < mediaCorte) {
      className = "grade-below";
    }

    return { value: displayVal, className };
  };

  const toggleDisciplineOrder = () => {
    setDisciplinesOrder((prev) => [...prev].reverse());
  };

  const handleDisciplineSelection = (discipline) => {
    setSelectedDisciplines((prev) =>
      prev.includes(discipline)
        ? prev.filter((d) => d !== discipline)
        : [...prev, discipline]
    );
  };
  const selectAllDisciplines = () => setSelectedDisciplines(disciplinesOrder);
  const deselectAllDisciplines = () => setSelectedDisciplines([]);

  // --- CALCULO DO STATUS (RECUPERAÇÃO vs CONSELHO) ---
  const currentStudent = filteredStudents[currentIndex];
  let statusBoxHtml = null;

  if (currentStudent) {
    let belowAverageCount = 0;

    selectedDisciplines.forEach((subject) => {
      const key = subject.toUpperCase();
      const g = currentStudent.grades[key];

      if (!g) {
        belowAverageCount++;
        return;
      }

      // Usa a mesma lógica de prioridade para o status box
      let gradeToCheck = null;
      if (showExameFinal) {
        gradeToCheck = g.mf_exame;
      } else if (showMediaFinal) {
        gradeToCheck = g.mf_original;
      }

      if (gradeToCheck === null) return;

      const str = String(gradeToCheck).replace(",", ".").trim();
      const num = parseFloat(str);

      if (str === "" || isNaN(num) || num < mediaCorte) {
        belowAverageCount++;
      }
    });

    if (belowAverageCount > 0) {
      if (belowAverageCount >= 5) {
        statusBoxHtml = (
          <span className="status-box red">
            Recuperação ({belowAverageCount})
          </span>
        );
      } else {
        statusBoxHtml = (
          <span className="status-box green">
            Apto para conselho ({belowAverageCount})
          </span>
        );
      }
    }
  }

  return (
    <div
      className="app-container"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <img
        id="headerImage"
        src="https://i.ibb.co/9kWW0n20/header-img.png"
        alt="Cabeçalho Relatório"
      />

      <div className="content-container">
        {loading && <div className="info-message">Processando planilha...</div>}
        {errorMsg && <div className="error-message">{errorMsg}</div>}

        {!loading &&
          filteredStudents.length === 0 &&
          allStudents.length > 0 && (
            <div className="info-message">
              Nenhum aluno encontrado com pendências nas disciplinas
              selecionadas.
            </div>
          )}

        {!loading && allStudents.length === 0 && !errorMsg && (
          <div className="info-message" style={{ marginTop: "50px" }}>
            <h3>Bem-vindo ao Visualizador</h3>
            <p>
              Por favor, carregue a planilha baixada do Unimestre (.xlsx ou
              .csv) abaixo ou **ARRASTE** o arquivo para esta área. O relatório
              é o <b>Mapa de Notas por Etapa.</b>
            </p>
          </div>
        )}

        {currentStudent && (
          <div id="studentCard">
            <div className="student-info">
              <img
                src={
                  currentStudent.photoUrl ||
                  "https://via.placeholder.com/100?text=Foto"
                }
                alt={`Foto de ${currentStudent.name}`}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src =
                    "https://via.placeholder.com/100?text=Sem+Foto";
                }}
                onClick={() => {
                  setModalImgSrc(
                    currentStudent.fullPhotoUrl || currentStudent.photoUrl
                  );
                  setModalOpen(true);
                  setIsZoomed(false);
                }}
                style={{ cursor: "pointer" }}
              />
              <div style={{ width: "100%" }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <h2 style={{ margin: 0 }}>
                    {currentStudent.name} {statusBoxHtml}
                  </h2>
                  {/* Pequeno contador de posicao */}
                  <span style={{ color: "#777", fontSize: "0.9em" }}>
                    {currentIndex + 1} / {filteredStudents.length}
                  </span>
                </div>
              </div>
            </div>

            <table className="grades-table">
              <thead>
                <tr>
                  <th>Disciplina</th>
                  {/* CABEÇALHO CONDICIONAL POR ETAPA */}
                  {showStages && <th>Etapa 1</th>}
                  {showStages && <th>Etapa 2</th>}
                  {showStages && <th>Etapa 3</th>}
                  {/* CABEÇALHO CONDICIONAL POR NOTA FINAL */}
                  {showExameFinal && <th>Exame Final</th>}
                  {showMediaFinal && <th>Média Final</th>}
                </tr>
              </thead>
              <tbody>
                {disciplinesOrder.map((subject) => {
                  if (!currentStudent.grades[subject]) return null;

                  const g = currentStudent.grades[subject];
                  const isCalculated = selectedDisciplines.includes(subject);

                  const d1 = formatGrade(g.etapa1, highlightStages);
                  const d2 = formatGrade(g.etapa2, highlightStages);
                  const d3 = formatGrade(g.etapa3, highlightStages);

                  // Formata as duas colunas de nota final
                  const mf_orig = formatGrade(g.mf_original, true);
                  const mf_exam = formatGrade(g.mf_exame, true);

                  // Visual: Opacidade baixa se a matéria foi desmarcada no filtro
                  const rowStyle = isCalculated
                    ? {}
                    : {
                        opacity: 0.4,
                        backgroundColor: "#f9f9f9",
                        filter: "grayscale(100%)",
                      };

                  return (
                    <tr key={subject} style={rowStyle}>
                      <td style={{ textAlign: "left", fontWeight: "bold" }}>
                        {subject}
                        {!isCalculated && (
                          <span
                            style={{
                              fontSize: "0.7em",
                              fontWeight: "normal",
                              marginLeft: "5px",
                            }}
                          >
                            (Ignorada)
                          </span>
                        )}
                      </td>

                      {/* CÉLULAS DE ETAPA (CONDICIONAIS) */}
                      {showStages && (
                        <td className={d1.className}>{d1.value}</td>
                      )}
                      {showStages && (
                        <td className={d2.className}>{d2.value}</td>
                      )}
                      {showStages && (
                        <td className={d3.className}>{d3.value}</td>
                      )}

                      {/* CÉLULAS DE NOTA FINAL (CONDICIONAIS) */}
                      {showExameFinal && (
                        <td className={mf_exam.className}>{mf_exam.value}</td>
                      )}
                      {showMediaFinal && (
                        <td className={mf_orig.className}>{mf_orig.value}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredStudents.length > 0 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentIndex((prev) => prev - 1)}
              disabled={currentIndex === 0}
            >
              &lt; Anterior
            </button>
            <span id="pageInfo">
              Aluno {currentIndex + 1} de {filteredStudents.length}
            </span>
            <button
              onClick={() => setCurrentIndex((prev) => prev + 1)}
              disabled={currentIndex === filteredStudents.length - 1}
            >
              Próximo &gt;
            </button>
          </div>
        )}
      </div>

      <div className="controls">
        {/* Usamos o layout de colunas no CSS externo para melhor visualização */}
        <div className="filter-section">
          {/* COLUNA 1: DADOS E TURMAS */}
          <div className="control-column">
            <div className="file-upload-wrapper">
              <label style={{ fontSize: "0.8em", fontWeight: "bold" }}>
                Arquivo:
              </label>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
              />
            </div>

            <div className="filter-group">
              <label>Turma:</label>
              <select
                value={selectedTurma}
                onChange={(e) => setSelectedTurma(e.target.value)}
                disabled={allStudents.length === 0}
              >
                <option value="todas">Todas</option>
                {turmas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn-blue"
              onClick={toggleDisciplineOrder}
              disabled={allStudents.length === 0}
              style={{ marginTop: "10px" }}
            >
              Inverter Ordem
            </button>
          </div>

          {/* COLUNA 2: FILTROS DE NOTA E EXIBIÇÃO */}
          <div className="control-column">
            <div className="filter-group">
              <label>Média Corte:</label>
              <input
                type="number"
                value={mediaCorte}
                step="0.1"
                onChange={(e) => setMediaCorte(parseFloat(e.target.value))}
                style={{ maxWidth: "60px" }}
              />
            </div>

            {/* CHECKBOX: MOSTRAR EXAME FINAL */}
            <div className="filter-group">
              <label style={{ cursor: "pointer", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={showExameFinal}
                  onChange={(e) => setShowExameFinal(e.target.checked)}
                  style={{ width: "auto", marginRight: "5px" }}
                  disabled={allStudents.length === 0}
                />
                Mostrar Exame Final
              </label>
            </div>

            {/* CHECKBOX: MOSTRAR MÉDIA FINAL */}
            <div className="filter-group">
              <label style={{ cursor: "pointer", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={showMediaFinal}
                  onChange={(e) => setShowMediaFinal(e.target.checked)}
                  style={{ width: "auto", marginRight: "5px" }}
                  disabled={allStudents.length === 0}
                />
                Mostrar Média Final
              </label>
            </div>

            {/* CHECKBOX: MOSTRAR ETAPAS */}
            <div className="filter-group">
              <label style={{ cursor: "pointer", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={showStages}
                  onChange={(e) => setShowStages(e.target.checked)}
                  style={{ width: "auto", marginRight: "5px" }}
                  disabled={allStudents.length === 0}
                />
                Mostrar Etapas
              </label>
            </div>

            {/* CHECKBOX: DESTAQUE DE ETAPAS */}
            <div className="filter-group">
              <label style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={highlightStages}
                  onChange={(e) => setHighlightStages(e.target.checked)}
                  style={{ width: "auto", marginRight: "5px" }}
                  disabled={allStudents.length === 0}
                />
                Destacar Etapas
              </label>
            </div>
          </div>

          {/* COLUNA 3: FILTRO DE DISCIPLINAS */}
          <div className="control-column" style={{ minWidth: "200px" }}>
            <div className="filter-group">
              <label>Disciplinas:</label>
              <div className="discipline-filter">
                <button
                  onClick={() => setDisciplineFilterOpen(!disciplineFilterOpen)}
                  disabled={allStudents.length === 0}
                  className="discipline-filter-button"
                >
                  Selecionar ({selectedDisciplines.length})
                </button>

                {disciplineFilterOpen && (
                  <div className="discipline-dropdown">
                    <div
                      style={{
                        display: "flex",
                        gap: "5px",
                        padding: "5px",
                        borderBottom: "1px solid #ddd",
                        marginBottom: "5px",
                      }}
                    >
                      <button
                        onClick={selectAllDisciplines}
                        style={{ fontSize: "0.7em", padding: "4px" }}
                      >
                        Todas
                      </button>
                      <button
                        onClick={deselectAllDisciplines}
                        style={{ fontSize: "0.7em", padding: "4px" }}
                      >
                        Nenhuma
                      </button>
                    </div>
                    {disciplinesOrder.map((d) => (
                      <label key={d} className="discipline-item">
                        <input
                          type="checkbox"
                          checked={selectedDisciplines.includes(d)}
                          onChange={() => handleDisciplineSelection(d)}
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <button className="btn-red" onClick={() => window.close()}>
          Fechar
        </button>
      </div>

      {modalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target.className.includes("modal-overlay"))
              setModalOpen(false);
          }}
        >
          <span className="modal-close" onClick={() => setModalOpen(false)}>
            &times;
          </span>
          <img
            className={`modal-content ${isZoomed ? "zoomed" : ""}`}
            src={modalImgSrc}
            alt="Zoom"
            onClick={() => setIsZoomed(!isZoomed)}
          />
        </div>
      )}
    </div>
  );
}

export default App;
