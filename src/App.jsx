import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx"; // Importa a biblioteca de leitura de Excel
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

  // Estado do Modal de Foto
  const [modalOpen, setModalOpen] = useState(false);
  const [modalImgSrc, setModalImgSrc] = useState("");
  const [isZoomed, setIsZoomed] = useState(false);

  // --- LÓGICA DE IMPORTAÇÃO DA PLANILHA (Substitui o Google Script) ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg("");
    setAllStudents([]); // Limpa dados anteriores

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });

        // Pega a primeira aba da planilha
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // Converte para array de arrays (igual ao getValues() do GAS)
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        processData(data);
      } catch (err) {
        console.error(err);
        setErrorMsg("Erro ao ler o arquivo. Verifique o formato.");
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- PROCESSAMENTO DE DADOS (Traduzido do GAS) ---
  const processData = (values) => {
    if (!values || values.length < 2) {
      setErrorMsg("A planilha parece estar vazia ou sem cabeçalho.");
      setLoading(false);
      return;
    }

    const headers = values[0].map(String);

    // Mapear índices das colunas
    const COL_ALUNO_ID = headers.indexOf("cd_aluno");
    const COL_NOME = headers.indexOf("nm_pessoa");
    const COL_FOTO = headers.indexOf("ds_link_foto");
    const COL_DISCIPLINA = headers.indexOf("disciplina");
    const COL_NOTA1 = headers.indexOf("nota_d1");
    const COL_NOTA2 = headers.indexOf("nota_d2");
    const COL_NOTA3 = headers.indexOf("nota_d3");
    const COL_MF = headers.indexOf("mediafinal");
    const COL_TURMA = headers.indexOf("ds_turma");

    // Validação de colunas
    if ([COL_ALUNO_ID, COL_NOME, COL_MF, COL_TURMA].includes(-1)) {
      setErrorMsg(
        "Colunas obrigatórias não encontradas (cd_aluno, nm_pessoa, mediafinal, ds_turma)."
      );
      setLoading(false);
      return;
    }

    const studentsMap = {};
    const discOrderTemp = [];
    const turmasSet = new Set();

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      // Proteção contra linhas vazias no final
      if (!row[COL_ALUNO_ID]) continue;

      const studentId = String(row[COL_ALUNO_ID]).trim();

      // Captura Turmas
      const turmaName = String(row[COL_TURMA] || "").trim();
      if (turmaName) turmasSet.add(turmaName);

      // Cria objeto do aluno se não existir
      if (!studentsMap[studentId]) {
        let thumbUrl = row[COL_FOTO] ? String(row[COL_FOTO]).trim() : "";
        // Lógica de URL da foto
        let fullUrl = thumbUrl
          .replace(/&width=\d+/i, "&width=600")
          .replace(/&height=\d+/i, "&height=875");

        studentsMap[studentId] = {
          id: studentId,
          name: String(row[COL_NOME]).trim(),
          photoUrl: thumbUrl,
          fullPhotoUrl: fullUrl,
          turma: turmaName,
          grades: {},
        };
      }

      // Processa Disciplinas
      let disciplina = row[COL_DISCIPLINA]
        ? String(row[COL_DISCIPLINA]).trim()
        : "";
      let disciplinaKey = disciplina.toUpperCase();

      if (!disciplinaKey || disciplinaKey === "SOESP") continue;

      if (!discOrderTemp.includes(disciplinaKey)) {
        discOrderTemp.push(disciplinaKey);
      }

      studentsMap[studentId].grades[disciplinaKey] = {
        etapa1: row[COL_NOTA1],
        etapa2: row[COL_NOTA2],
        etapa3: row[COL_NOTA3],
        mf: row[COL_MF],
      };
    }

    // Finalização
    setDisciplinesOrder(discOrderTemp);
    setTurmas(Array.from(turmasSet).sort());
    setAllStudents(Object.values(studentsMap)); // A ordem original não é garantida por objeto, mas faremos sort depois
    setLoading(false);
  };

  // --- EFEITO DE FILTRO ---
  useEffect(() => {
    if (allStudents.length === 0) {
      setFilteredStudents([]);
      return;
    }

    // 1. Filtra por Turma
    let temp = allStudents;
    if (selectedTurma !== "todas") {
      temp = temp.filter((s) => s.turma === selectedTurma);
    }

    // 2. Filtra por Notas Baixas (Lógica original)
    // Mostra o aluno SE ele tiver pelo menos uma nota abaixo da média (exceto EDF)
    temp = temp.filter((student) => {
      let hasBelowGrade = false;
      if (!student.grades) return false;

      for (const subject in student.grades) {
        if (subject.toUpperCase() === "EDF") continue;

        const gradeInfo = student.grades[subject];
        const mfStr = String(gradeInfo.mf).replace(",", ".").trim();
        const mf = parseFloat(mfStr);

        if (mfStr === "---" || mfStr === "" || isNaN(mf) || mf < mediaCorte) {
          hasBelowGrade = true;
          break;
        }
      }
      return hasBelowGrade;
    });

    // 3. Ordenação Alfabética Inicial
    temp.sort((a, b) => a.name.localeCompare(b.name));

    setFilteredStudents(temp);
    setCurrentIndex(0); // Reseta paginação ao filtrar
  }, [allStudents, selectedTurma, mediaCorte]);

  // --- HELPERS DE RENDERIZAÇÃO ---
  const formatGrade = (value, applyRedClass) => {
    const str = String(value).replace(",", ".").trim();
    const num = parseFloat(str);

    if (str === "---" || str === "" || isNaN(num) || value === undefined) {
      return {
        value: <span className="grade-blank">{value || "-"}</span>,
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

  // Inverter Ordem das Disciplinas
  const toggleDisciplineOrder = () => {
    setDisciplinesOrder((prev) => [...prev].reverse());
  };

  // Renderização condicional do aluno atual
  const currentStudent = filteredStudents[currentIndex];

  // Cálculo de Status Box (Recuperação vs Conselho)
  let statusBoxHtml = null;
  if (currentStudent) {
    let belowAverageCount = 0;
    for (const subject in currentStudent.grades) {
      if (subject.toUpperCase() === "EDF") continue;
      const val = currentStudent.grades[subject].mf;
      const str = String(val).replace(",", ".").trim();
      const num = parseFloat(str);
      if (str === "---" || str === "" || isNaN(num) || num < mediaCorte) {
        belowAverageCount++;
      }
    }

    if (belowAverageCount > 0) {
      if (belowAverageCount >= 5) {
        statusBoxHtml = <span className="status-box red">Recuperação</span>;
      } else {
        statusBoxHtml = (
          <span className="status-box green">Apto para conselho</span>
        );
      }
    }
  }

  // --- RENDER DO APP ---
  return (
    <div className="app-container">
      {/* HEADER */}
      <img
        id="headerImage"
        src="https://www.redeinspiraeducadores.com.br/wp-content/uploads/2009/05/logo_inspira.png"
        alt="Cabeçalho Relatório"
      />

      {/* ÁREA DE CONTEÚDO */}
      <div className="content-container">
        {loading && <div className="info-message">Processando planilha...</div>}
        {errorMsg && <div className="error-message">{errorMsg}</div>}

        {!loading &&
          filteredStudents.length === 0 &&
          allStudents.length > 0 && (
            <div className="info-message">
              Nenhum aluno encontrado com os filtros atuais.
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

        {/* CARTÃO DO ALUNO */}
        {currentStudent && (
          <div id="studentCard" style={{ display: "block" }}>
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
              />
              <h2>
                {currentStudent.name} {statusBoxHtml}
              </h2>
            </div>

            <table className="grades-table">
              <thead>
                <tr>
                  <th>Disciplina</th>
                  <th>Etapa 1</th>
                  <th>Etapa 2</th>
                  <th>Etapa 3</th>
                  <th>MF (Média Final)</th>
                </tr>
              </thead>
              <tbody>
                {disciplinesOrder.map((subject) => {
                  // Só renderiza se o aluno tiver nota nessa matéria (ou exibe vazio se preferir, a lógica original ocultava se não existisse no map)
                  // A lógica original usava as chaves do aluno se order estivesse vazia, mas aqui sempre teremos order.
                  // Vamos checar se o aluno tem a disciplina:
                  if (!currentStudent.grades[subject]) return null;

                  const g = currentStudent.grades[subject];
                  const d1 = formatGrade(g.etapa1, false);
                  const d2 = formatGrade(g.etapa2, false);
                  const d3 = formatGrade(g.etapa3, false);
                  const mf = formatGrade(g.mf, true); // MF permite vermelho

                  return (
                    <tr key={subject}>
                      <td>{subject}</td>
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

        {/* PAGINAÇÃO */}
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

      {/* CONTROLES / RODAPÉ FIXO */}
      <div className="controls">
        <div className="filter-section">
          {/* Input de Arquivo (NOVIDADE) */}
          <div className="file-upload-wrapper">
            <label style={{ fontSize: "0.8em", fontWeight: "bold" }}>
              Carregar Planilha:
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
              <option value="todas">Todas as Turmas</option>
              {turmas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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

          <button
            className="btn-green"
            onClick={() => {
              /* No React, o filtro é automático via useEffect, mas mantemos o botão visualmente ou para refresh manual se quisesse */
            }}
            disabled={loading || allStudents.length === 0}
          >
            {loading ? "Carregando..." : "Alunos Filtrados"}
          </button>

          <button
            className="btn-blue"
            onClick={toggleDisciplineOrder}
            disabled={allStudents.length === 0}
          >
            Inverter Ordem &#8645;
          </button>
        </div>

        <button className="btn-red" onClick={() => window.close()}>
          Fechar
        </button>
      </div>

      {/* MODAL DE FOTO */}
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
