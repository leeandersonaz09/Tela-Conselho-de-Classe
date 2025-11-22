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

  // Filtros
  const [selectedDisciplines, setSelectedDisciplines] = useState([]);
  const [disciplineFilterOpen, setDisciplineFilterOpen] = useState(false);
  const [highlightStages, setHighlightStages] = useState(false);

  // Modal de Foto
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImgSrc, setModalImgSrc] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg("");
    setAllStudents([]);

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

    // Mapeia colunas de notas
    const COL_NOTA1 =
      headers.indexOf("nota_d1") > -1
        ? headers.indexOf("nota_d1")
        : headers.indexOf("nota");
    const COL_NOTA2 =
      headers.indexOf("nota_d2") > -1
        ? headers.indexOf("nota_d2")
        : headers.indexOf("rec");
    const COL_NOTA3 = headers.indexOf("nota_d3");

    let COL_MF = headers.indexOf("media");
    if (COL_MF === -1) COL_MF = headers.indexOf("mediafinal");

    const COL_TURMA = headers.findIndex(
      (h) => h === "ds_turma" || h === "turma"
    );

    if (COL_ALUNO_ID === -1 || COL_NOME === -1 || COL_MF === -1) {
      setErrorMsg("Faltando colunas: cd_aluno, nm_pessoa, media.");
      setLoading(false);
      return;
    }

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
        // --- LÓGICA DA FOTO (CORRIGIDA) ---
        let thumbUrl =
          COL_FOTO > -1 && row[COL_FOTO] ? String(row[COL_FOTO]).trim() : "";
        let fullUrl = thumbUrl;

        // Se a URL tiver parametros de tamanho, substituímos para alta resolução
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

      studentsMap[studentId].grades[disciplinaKey] = {
        etapa1: COL_NOTA1 > -1 ? row[COL_NOTA1] : "",
        etapa2: COL_NOTA2 > -1 ? row[COL_NOTA2] : "",
        etapa3: COL_NOTA3 > -1 ? row[COL_NOTA3] : "",
        mf: row[COL_MF],
      };
    }

    setDisciplinesOrder(discOrderTemp);

    // --- SELEÇÃO INTELIGENTE (RESOLVE O PROBLEMA DA ALICE) ---
    // Removemos automaticamente da seleção inicial as matérias que não usam nota numérica
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

    // 2. Filtro de Notas (O coração da lógica)
    temp = temp.filter((student) => {
      if (!student.grades) return false;

      // O aluno só aparece se tiver ALGUMA nota vermelha ou falta de nota
      // APENAS nas disciplinas selecionadas.
      return selectedDisciplines.some((subject) => {
        const subjectKey = subject.toUpperCase();
        const gradeInfo = student.grades[subjectKey];

        // Se a disciplina foi selecionada mas o aluno não tem registro nela
        // Consideramos pendência (mas como removemos EDF/PV da seleção, isso não afeta Alice)
        if (!gradeInfo) return true;

        const mfStr = String(gradeInfo.mf).replace(",", ".").trim();
        const mf = parseFloat(mfStr);

        // Se a nota final for vazia, inválida ou MENOR que o corte -> MOSTRA O ALUNO
        if (mfStr === "---" || mfStr === "" || isNaN(mf) || mf < mediaCorte) {
          return true;
        }

        // Se a nota for >= mediaCorte, retorna false (não mostra por causa dessa matéria)
        return false;
      });
    });

    temp.sort((a, b) => a.name.localeCompare(b.name));
    setFilteredStudents(temp);
    setCurrentIndex(0);
  }, [allStudents, selectedTurma, mediaCorte, selectedDisciplines]);

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

    // Conta quantas matérias ruins o aluno tem (baseado APENAS nas selecionadas)
    selectedDisciplines.forEach((subject) => {
      const key = subject.toUpperCase();
      const g = currentStudent.grades[key];

      if (!g) {
        belowAverageCount++;
        return;
      }

      const str = String(g.mf).replace(",", ".").trim();
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
    <div className="app-container">
      <img
        id="headerImage"
        src="https://raw.githubusercontent.com/leeandersonaz09/Tela-Conselho-de-Classe/refs/heads/main/src/assets/header-img.png"
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
              Por favor, carregue a planilha (.xlsx ou .csv) abaixo para
              começar.
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
                  <th>Etapa 1</th>
                  <th>Etapa 2</th>
                  <th>Etapa 3</th>
                  <th>Média Final</th>
                </tr>
              </thead>
              <tbody>
                {disciplinesOrder.map((subject) => {
                  // Se o aluno não tem essa disciplina na planilha, pula
                  if (!currentStudent.grades[subject]) return null;

                  const g = currentStudent.grades[subject];
                  // Verifica se está marcada no filtro
                  const isCalculated = selectedDisciplines.includes(subject);

                  const d1 = formatGrade(g.etapa1, highlightStages);
                  const d2 = formatGrade(g.etapa2, highlightStages);
                  const d3 = formatGrade(g.etapa3, highlightStages);

                  const mf = formatGrade(g.mf, true); // Média sempre vermelha se baixa

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
                      <td className={d1.className}>{d1.value}</td>
                      <td className={d2.className}>{d2.value}</td>
                      <td className={d3.className}>{d3.value}</td>
                      <td className={mf.className}>{mf.value}</td>
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
        <div className="filter-section">
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

          <div className="filter-group">
            <label>Média:</label>
            <input
              type="number"
              value={mediaCorte}
              step="0.1"
              onChange={(e) => setMediaCorte(parseFloat(e.target.value))}
            />
          </div>

          <div className="filter-group" style={{ marginLeft: "10px" }}>
            <label
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                fontSize: "0.9em",
              }}
            >
              <input
                type="checkbox"
                checked={highlightStages}
                onChange={(e) => setHighlightStages(e.target.checked)}
                style={{ width: "auto", marginRight: "5px" }}
              />
              Destacar Etapas
            </label>
          </div>

          <button
            className="btn-blue"
            onClick={toggleDisciplineOrder}
            disabled={allStudents.length === 0}
          >
            Inverter Ordem
          </button>
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
