const STORAGE_KEY = "quiz-studio-paper-v1";
const THEME_KEY = "quiz-studio-theme";

const typeLabels = {
  single: "单选题",
  multiple: "多选题",
  blank: "填空题",
  truefalse: "判断题",
  matching: "匹配题",
};

const defaultPaper = {
  title: "第一份 Quiz 试卷",
  description: "这是一份示例试卷。你可以在编辑页替换题目、答案和选项。",
  questions: [
    {
      id: makeId(),
      type: "single",
      prompt: "下面哪个选项是 JavaScript 中用于声明常量的关键字？",
      options: [
        { id: makeId(), text: "const", correct: true },
        { id: makeId(), text: "var", correct: false },
        { id: makeId(), text: "function", correct: false },
        { id: makeId(), text: "return", correct: false },
      ],
    },
    {
      id: makeId(),
      type: "multiple",
      prompt: "下面哪些题型已经在这个系统第一版中支持？",
      options: [
        { id: makeId(), text: "单选题", correct: true },
        { id: makeId(), text: "多选题", correct: true },
        { id: makeId(), text: "填空题", correct: true },
        { id: makeId(), text: "作文自动批改", correct: false },
      ],
    },
    {
      id: makeId(),
      type: "blank",
      prompt: "请输入英文单词 quiz 的中文常见含义。",
      answers: ["测验", "小测验"],
      caseSensitive: false,
    },
    {
      id: makeId(),
      type: "truefalse",
      prompt: "单选题和多选题在第二次开始做题时可以重新打乱选项顺序。",
      answer: true,
    },
    {
      id: makeId(),
      type: "matching",
      prompt: "把题型和它的答题方式匹配起来。",
      pairs: [
        { id: makeId(), left: "判断题", right: "选择正确或错误" },
        { id: makeId(), left: "填空题", right: "输入文字答案" },
        { id: makeId(), left: "匹配题", right: "连接一对一答案" },
      ],
    },
  ],
};

let paper = loadPaper();
let selectedQuestionId = paper.questions[0]?.id ?? null;
let currentMode = "edit";
let session = null;
let toastTimer = null;

const editorView = document.getElementById("editorView");
const quizView = document.getElementById("quizView");
const editModeButton = document.getElementById("editModeButton");
const quizModeButton = document.getElementById("quizModeButton");
const themeToggle = document.getElementById("themeToggle");
const paperTitle = document.getElementById("paperTitle");
const paperDescription = document.getElementById("paperDescription");
const questionCount = document.getElementById("questionCount");
const questionList = document.getElementById("questionList");
const questionEditor = document.getElementById("questionEditor");
const quizPanel = document.getElementById("quizPanel");
const exportButton = document.getElementById("exportButton");
const importInput = document.getElementById("importInput");
const toast = document.getElementById("toast");

init();

function init() {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";
  bindGlobalEvents();
  renderAll();
}

function bindGlobalEvents() {
  editModeButton.addEventListener("click", () => setMode("edit"));
  quizModeButton.addEventListener("click", () => setMode("quiz"));
  themeToggle.addEventListener("click", toggleTheme);

  paperTitle.addEventListener("input", () => {
    paper.title = paperTitle.value;
    savePaper();
  });

  paperDescription.addEventListener("input", () => {
    paper.description = paperDescription.value;
    savePaper();
  });

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.addEventListener("click", () => addQuestion(button.dataset.addType));
  });

  exportButton.addEventListener("click", exportPaper);
  importInput.addEventListener("change", importPaper);
}

function renderAll() {
  paperTitle.value = paper.title;
  paperDescription.value = paper.description;
  renderQuestionList();
  renderQuestionEditor();
  renderQuizStart();
}

function setMode(mode) {
  currentMode = mode;
  editorView.classList.toggle("hidden", mode !== "edit");
  quizView.classList.toggle("hidden", mode !== "quiz");
  editModeButton.classList.toggle("active", mode === "edit");
  quizModeButton.classList.toggle("active", mode === "quiz");
  if (mode === "quiz") {
    session = null;
    renderQuizStart();
  }
}

function renderQuestionList() {
  questionCount.textContent = paper.questions.length;

  if (!paper.questions.length) {
    questionList.innerHTML = `<div class="empty-state"><div>还没有题目<br>从上方添加一种题型开始</div></div>`;
    return;
  }

  questionList.innerHTML = paper.questions
    .map((question, index) => {
      const title = question.prompt.trim() || "未命名题目";
      return `
        <button class="question-item ${question.id === selectedQuestionId ? "active" : ""}" type="button" data-select-question="${question.id}">
          <span class="question-title">
            <strong>${index + 1}. ${escapeHtml(title)}</strong>
            <span>${typeLabels[question.type]}</span>
          </span>
          <span class="type-pill">${shortType(question.type)}</span>
        </button>
      `;
    })
    .join("");

  questionList.querySelectorAll("[data-select-question]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedQuestionId = button.dataset.selectQuestion;
      renderQuestionList();
      renderQuestionEditor();
    });
  });
}

function renderQuestionEditor() {
  const question = getSelectedQuestion();

  if (!question) {
    questionEditor.innerHTML = `<div class="empty-state"><div>请选择或添加一道题目</div></div>`;
    return;
  }

  questionEditor.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${typeLabels[question.type]}</span>
        <div class="row-actions">
          <button class="small-button" type="button" id="duplicateQuestion">复制</button>
          <button class="danger-button small-button" type="button" id="deleteQuestion">删除</button>
        </div>
      </div>

      <div class="editor-heading">
        <div class="field-grid">
          <label>
            <span>题目内容</span>
            <textarea id="questionPrompt" rows="4">${escapeHtml(question.prompt)}</textarea>
          </label>
          <label>
            <span>题型</span>
            <select id="questionType">
              ${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${question.type === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div class="answer-section" id="answerEditor">
        ${renderAnswerEditor(question)}
      </div>
    </div>
  `;

  document.getElementById("questionPrompt").addEventListener("input", (event) => {
    question.prompt = event.target.value;
    saveAndRenderList();
  });

  document.getElementById("questionType").addEventListener("change", (event) => {
    convertQuestionType(question, event.target.value);
    savePaper();
    renderAll();
  });

  document.getElementById("duplicateQuestion").addEventListener("click", () => duplicateQuestion(question.id));
  document.getElementById("deleteQuestion").addEventListener("click", () => deleteQuestion(question.id));
  bindAnswerEditor(question);
}

function renderAnswerEditor(question) {
  if (question.type === "single" || question.type === "multiple") {
    const optionRows = question.options
      .map((option, index) => `
        <div class="option-row" data-option-id="${option.id}">
          <label class="correct-toggle" title="标记为正确答案">
            <input type="${question.type === "single" ? "radio" : "checkbox"}" name="correctOption" ${option.correct ? "checked" : ""} data-option-correct="${option.id}">
          </label>
          <input type="text" value="${escapeHtml(option.text)}" placeholder="选项 ${String.fromCharCode(65 + index)}" data-option-text="${option.id}">
          <button class="small-button" type="button" data-delete-option="${option.id}">删除</button>
        </div>
      `)
      .join("");

    return `
      ${optionRows}
      <button class="secondary-button" type="button" id="addOption">添加选项</button>
    `;
  }

  if (question.type === "blank") {
    return `
      <label>
        <span>可接受答案</span>
        <textarea id="blankAnswers" rows="6">${escapeHtml((question.answers || []).join("\n"))}</textarea>
      </label>
      <label class="inline-check">
        <span>区分英文大小写</span>
        <input id="caseSensitive" type="checkbox" ${question.caseSensitive ? "checked" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label>
        <span>正确答案</span>
        <select id="trueFalseAnswer">
          <option value="true" ${question.answer ? "selected" : ""}>正确</option>
          <option value="false" ${!question.answer ? "selected" : ""}>错误</option>
        </select>
      </label>
    `;
  }

  const pairRows = question.pairs
    .map((pair, index) => `
      <div class="pair-row" data-pair-id="${pair.id}">
        <input type="text" value="${escapeHtml(pair.left)}" placeholder="左侧项目 ${index + 1}" data-pair-left="${pair.id}">
        <input type="text" value="${escapeHtml(pair.right)}" placeholder="右侧答案 ${index + 1}" data-pair-right="${pair.id}">
        <button class="small-button" type="button" data-delete-pair="${pair.id}">删除</button>
      </div>
    `)
    .join("");

  return `
    ${pairRows}
    <button class="secondary-button" type="button" id="addPair">添加配对</button>
  `;
}

function bindAnswerEditor(question) {
  if (question.type === "single" || question.type === "multiple") {
    document.querySelectorAll("[data-option-text]").forEach((input) => {
      input.addEventListener("input", (event) => {
        const option = question.options.find((item) => item.id === input.dataset.optionText);
        option.text = event.target.value;
        savePaper();
      });
    });

    document.querySelectorAll("[data-option-correct]").forEach((input) => {
      input.addEventListener("change", () => {
        if (question.type === "single") {
          question.options.forEach((option) => {
            option.correct = option.id === input.dataset.optionCorrect;
          });
        } else {
          const option = question.options.find((item) => item.id === input.dataset.optionCorrect);
          option.correct = input.checked;
        }
        ensureChoiceValidity(question);
        savePaper();
        renderQuestionEditor();
      });
    });

    document.querySelectorAll("[data-delete-option]").forEach((button) => {
      button.addEventListener("click", () => {
        question.options = question.options.filter((option) => option.id !== button.dataset.deleteOption);
        ensureChoiceValidity(question);
        savePaper();
        renderQuestionEditor();
      });
    });

    document.getElementById("addOption").addEventListener("click", () => {
      question.options.push({ id: makeId(), text: "", correct: question.options.length === 0 });
      savePaper();
      renderQuestionEditor();
    });
    return;
  }

  if (question.type === "blank") {
    document.getElementById("blankAnswers").addEventListener("input", (event) => {
      question.answers = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
      savePaper();
    });
    document.getElementById("caseSensitive").addEventListener("change", (event) => {
      question.caseSensitive = event.target.checked;
      savePaper();
    });
    return;
  }

  if (question.type === "truefalse") {
    document.getElementById("trueFalseAnswer").addEventListener("change", (event) => {
      question.answer = event.target.value === "true";
      savePaper();
    });
    return;
  }

  document.querySelectorAll("[data-pair-left]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const pair = question.pairs.find((item) => item.id === input.dataset.pairLeft);
      pair.left = event.target.value;
      savePaper();
    });
  });

  document.querySelectorAll("[data-pair-right]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const pair = question.pairs.find((item) => item.id === input.dataset.pairRight);
      pair.right = event.target.value;
      savePaper();
    });
  });

  document.querySelectorAll("[data-delete-pair]").forEach((button) => {
    button.addEventListener("click", () => {
      question.pairs = question.pairs.filter((pair) => pair.id !== button.dataset.deletePair);
      savePaper();
      renderQuestionEditor();
    });
  });

  document.getElementById("addPair").addEventListener("click", () => {
    question.pairs.push({ id: makeId(), left: "", right: "" });
    savePaper();
    renderQuestionEditor();
  });
}

function renderQuizStart() {
  if (currentMode !== "quiz") return;

  const stats = Object.keys(typeLabels).map((type) => ({
    type,
    count: paper.questions.filter((question) => question.type === type).length,
  }));

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${escapeHtml(paper.title || "未命名试卷")}</h2>
        <p>${escapeHtml(paper.description || "准备开始答题。")}</p>
      </div>
      <div class="stats-grid">
        ${stats.map((item) => `
          <div class="stat-tile">
            <strong>${item.count}</strong>
            <span>${typeLabels[item.type]}</span>
          </div>
        `).join("")}
      </div>
      <div class="quiz-actions">
        <button class="primary-button" id="startQuiz" type="button" ${paper.questions.length ? "" : "disabled"}>开始做题</button>
        <button class="secondary-button" id="backToEdit" type="button">返回编辑</button>
      </div>
    </div>
  `;

  document.getElementById("startQuiz").addEventListener("click", startQuiz);
  document.getElementById("backToEdit").addEventListener("click", () => setMode("edit"));
}

function startQuiz() {
  const validQuestions = paper.questions.filter(isQuestionReady);
  if (!validQuestions.length) {
    showToast("还没有可作答的完整题目，请先检查题目和答案。");
    return;
  }

  session = {
    questions: validQuestions.map(prepareQuizQuestion),
    index: 0,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
  };
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const question = session.questions[session.index];
  const progress = Math.round((session.index / session.questions.length) * 100);

  quizPanel.innerHTML = `
    <div class="quiz-question">
      <div class="progress-line">
        <span>第 ${session.index + 1} / ${session.questions.length} 题</span>
        <span>${typeLabels[question.type]}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width: ${progress}%"></div></div>
      <div class="question-prompt">
        <span class="type-pill">${typeLabels[question.type]}</span>
        <h2>${escapeHtml(question.prompt || "未命名题目")}</h2>
      </div>
      ${session.feedback ? renderFeedback(session.feedback) : ""}
      <div class="answer-list">
        ${renderQuizAnswer(question)}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="quitQuiz">退出</button>
        <button class="primary-button" type="button" id="${session.submitted ? "nextQuestion" : "submitAnswer"}">${session.submitted ? nextLabel() : "提交答案"}</button>
      </div>
    </div>
  `;

  bindQuizAnswer(question);
  document.getElementById("quitQuiz").addEventListener("click", renderQuizStart);

  if (session.submitted) {
    document.getElementById("nextQuestion").addEventListener("click", goNextQuestion);
  } else {
    document.getElementById("submitAnswer").addEventListener("click", submitCurrentAnswer);
  }
}

function renderQuizAnswer(question) {
  const answer = session.answers[question.id];

  if (question.type === "single" || question.type === "multiple") {
    return question.options
      .map((option, index) => {
        const checked = question.type === "single"
          ? answer === option.id
          : Array.isArray(answer) && answer.includes(option.id);
        return `
          <label class="choice-line">
            <input type="${question.type === "single" ? "radio" : "checkbox"}" name="choiceAnswer" value="${option.id}" ${checked ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
            <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
            <span>${escapeHtml(option.text)}</span>
          </label>
        `;
      })
      .join("");
  }

  if (question.type === "blank") {
    return `
      <label>
        <span>你的答案</span>
        <input id="blankAnswer" type="text" value="${escapeHtml(answer || "")}" ${session.submitted ? "disabled" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="true" ${answer === true ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>正确</span>
      </label>
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="false" ${answer === false ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>错误</span>
      </label>
    `;
  }

  return question.pairs
    .map((pair) => `
      <label class="match-line">
        <span>${escapeHtml(pair.left)}</span>
        <select data-match-answer="${pair.id}" ${session.submitted ? "disabled" : ""}>
          <option value="">请选择</option>
          ${question.rightOptions.map((right) => `<option value="${right.id}" ${answer?.[pair.id] === right.id ? "selected" : ""}>${escapeHtml(right.text)}</option>`).join("")}
        </select>
      </label>
    `)
    .join("");
}

function bindQuizAnswer(question) {
  if (session.submitted) return;

  if (question.type === "single") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = input.value;
      });
    });
    return;
  }

  if (question.type === "multiple") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = Array.from(document.querySelectorAll("input[name='choiceAnswer']:checked")).map((item) => item.value);
      });
    });
    return;
  }

  if (question.type === "blank") {
    document.getElementById("blankAnswer").addEventListener("input", (event) => {
      session.answers[question.id] = event.target.value;
    });
    return;
  }

  if (question.type === "truefalse") {
    document.querySelectorAll("input[name='judgeAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = input.value === "true";
      });
    });
    return;
  }

  document.querySelectorAll("[data-match-answer]").forEach((select) => {
    select.addEventListener("change", () => {
      session.answers[question.id] ||= {};
      session.answers[question.id][select.dataset.matchAnswer] = select.value;
    });
  });
}

function submitCurrentAnswer() {
  const question = session.questions[session.index];
  const result = gradeQuestion(question, session.answers[question.id]);
  session.results[session.index] = result;
  session.submitted = true;
  session.feedback = result;
  renderCurrentQuestion();
}

function goNextQuestion() {
  if (session.index >= session.questions.length - 1) {
    renderResults();
    return;
  }

  session.index += 1;
  session.submitted = false;
  session.feedback = null;
  renderCurrentQuestion();
}

function renderResults() {
  const correctCount = session.results.filter((result) => result.correct).length;
  const percent = Math.round((correctCount / session.questions.length) * 100);

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>答题完成</h2>
        <p>${escapeHtml(paper.title || "未命名试卷")}</p>
      </div>
      <div class="result-score">
        <div>
          <strong>${percent}%</strong>
          <p>${correctCount} / ${session.questions.length} 题正确</p>
        </div>
      </div>
      <div class="review-list">
        ${session.questions.map((question, index) => {
          const result = session.results[index];
          return `
            <div class="review-item ${result.correct ? "correct" : "wrong"}">
              <strong>${index + 1}. ${escapeHtml(question.prompt)}</strong>
              <p class="meta-text">${typeLabels[question.type]} · ${result.correct ? "答对" : "答错"}</p>
              <p>${escapeHtml(result.detail)}</p>
            </div>
          `;
        }).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" id="backToEditorAfterResult" type="button">返回编辑</button>
        <button class="primary-button" id="retryQuiz" type="button">再做一次</button>
      </div>
    </div>
  `;

  document.getElementById("backToEditorAfterResult").addEventListener("click", () => setMode("edit"));
  document.getElementById("retryQuiz").addEventListener("click", startQuiz);
}

function renderFeedback(result) {
  return `
    <div class="feedback ${result.correct ? "correct" : "wrong"}">
      <span class="feedback-icon">${result.correct ? "✓" : "×"}</span>
      <div>
        <strong>${result.correct ? "答对了" : "答错了"}</strong>
        <p>${escapeHtml(result.detail)}</p>
      </div>
    </div>
  `;
}

function gradeQuestion(question, answer) {
  if (question.type === "single") {
    const correctId = question.options.find((option) => option.correct)?.id;
    const correctText = question.options.find((option) => option.id === correctId)?.text || "";
    return {
      correct: answer === correctId,
      detail: `正确答案：${correctText}`,
    };
  }

  if (question.type === "multiple") {
    const correctIds = question.options.filter((option) => option.correct).map((option) => option.id).sort();
    const answerIds = Array.isArray(answer) ? [...answer].sort() : [];
    const correct = JSON.stringify(correctIds) === JSON.stringify(answerIds);
    const correctText = question.options.filter((option) => option.correct).map((option) => option.text).join("、");
    return {
      correct,
      detail: `正确答案：${correctText}`,
    };
  }

  if (question.type === "blank") {
    const normalizedAnswer = normalizeText(answer || "", question.caseSensitive);
    const accepted = question.answers.map((item) => normalizeText(item, question.caseSensitive));
    return {
      correct: accepted.includes(normalizedAnswer),
      detail: `可接受答案：${question.answers.join("、")}`,
    };
  }

  if (question.type === "truefalse") {
    return {
      correct: answer === question.answer,
      detail: `正确答案：${question.answer ? "正确" : "错误"}`,
    };
  }

  const answerMap = answer || {};
  const correct = question.pairs.every((pair) => answerMap[pair.id] === pair.rightId);
  return {
    correct,
    detail: `正确配对：${question.pairs.map((pair) => `${pair.left} = ${pair.right}`).join("；")}`,
  };
}

function prepareQuizQuestion(question) {
  const cloned = structuredClone(question);

  if (cloned.type === "single" || cloned.type === "multiple") {
    cloned.options = shuffle(cloned.options);
  }

  if (cloned.type === "matching") {
    cloned.pairs = cloned.pairs.map((pair) => ({
      id: pair.id,
      left: pair.left,
      right: pair.right,
      rightId: pair.id,
    }));
    cloned.rightOptions = shuffle(cloned.pairs.map((pair) => ({
      id: pair.id,
      text: pair.right,
    })));
  }

  return cloned;
}

function isQuestionReady(question) {
  if (!question.prompt.trim()) return false;
  if (question.type === "single") return question.options.length >= 2 && question.options.some((option) => option.correct && option.text.trim());
  if (question.type === "multiple") return question.options.length >= 2 && question.options.filter((option) => option.correct && option.text.trim()).length >= 1;
  if (question.type === "blank") return question.answers?.some(Boolean);
  if (question.type === "truefalse") return typeof question.answer === "boolean";
  if (question.type === "matching") return question.pairs?.length >= 2 && question.pairs.every((pair) => pair.left.trim() && pair.right.trim());
  return false;
}

function addQuestion(type) {
  const question = createQuestion(type);
  paper.questions.push(question);
  selectedQuestionId = question.id;
  savePaper();
  renderAll();
  showToast(`已添加${typeLabels[type]}`);
}

function createQuestion(type) {
  const base = { id: makeId(), type, prompt: "" };

  if (type === "single") {
    return {
      ...base,
      options: [
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
      ],
    };
  }

  if (type === "multiple") {
    return {
      ...base,
      options: [
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: true },
        { id: makeId(), text: "", correct: false },
        { id: makeId(), text: "", correct: false },
      ],
    };
  }

  if (type === "blank") return { ...base, answers: [""], caseSensitive: false };
  if (type === "truefalse") return { ...base, answer: true };
  return {
    ...base,
    pairs: [
      { id: makeId(), left: "", right: "" },
      { id: makeId(), left: "", right: "" },
    ],
  };
}

function convertQuestionType(question, nextType) {
  const replacement = createQuestion(nextType);
  question.type = nextType;

  delete question.options;
  delete question.answers;
  delete question.caseSensitive;
  delete question.answer;
  delete question.pairs;

  Object.entries(replacement).forEach(([key, value]) => {
    if (key !== "id" && key !== "type" && key !== "prompt") question[key] = value;
  });
}

function duplicateQuestion(id) {
  const index = paper.questions.findIndex((question) => question.id === id);
  const copy = structuredClone(paper.questions[index]);
  copy.id = makeId();
  if (copy.options) copy.options = copy.options.map((option) => ({ ...option, id: makeId() }));
  if (copy.pairs) copy.pairs = copy.pairs.map((pair) => ({ ...pair, id: makeId() }));
  paper.questions.splice(index + 1, 0, copy);
  selectedQuestionId = copy.id;
  savePaper();
  renderAll();
  showToast("已复制题目");
}

function deleteQuestion(id) {
  paper.questions = paper.questions.filter((question) => question.id !== id);
  selectedQuestionId = paper.questions[0]?.id ?? null;
  savePaper();
  renderAll();
  showToast("已删除题目");
}

function ensureChoiceValidity(question) {
  if (!question.options.length) return;
  if (question.type === "single") {
    const selected = question.options.filter((option) => option.correct);
    question.options.forEach((option, index) => {
      option.correct = selected.length ? option.id === selected[0].id : index === 0;
    });
  }
}

function getSelectedQuestion() {
  return paper.questions.find((question) => question.id === selectedQuestionId) || null;
}

function saveAndRenderList() {
  savePaper();
  renderQuestionList();
}

function savePaper() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(paper));
}

function loadPaper() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : structuredClone(defaultPaper);
  } catch {
    return structuredClone(defaultPaper);
  }
}

function exportPaper() {
  const blob = new Blob([JSON.stringify(paper, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${paper.title || "quiz-paper"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importPaper(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.questions)) throw new Error("Invalid paper");
      paper = imported;
      selectedQuestionId = paper.questions[0]?.id ?? null;
      savePaper();
      renderAll();
      showToast("导入成功");
    } catch {
      showToast("导入失败，请选择正确的 JSON 试卷文件。");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
}

function nextLabel() {
  return session.index >= session.questions.length - 1 ? "查看结果" : "下一题";
}

function shortType(type) {
  return typeLabels[type].replace("题", "");
}

function normalizeText(value, caseSensitive) {
  const trimmed = String(value).trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}
