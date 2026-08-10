import { formatAnswer, gradeQuestion } from "./core/grading.js";
import { createLibraryBackup, parseLibraryBackup } from "./core/backup.js";
import {
  CORRECTION_COLORS,
  addCorrection,
  removeCorrection,
  renderCorrectionProjection,
} from "./core/corrections.js";
import {
  DOCUMENT_TYPES,
  createQuizLearnerResponse,
  createTranslationLearnerResponse,
  normalizeTeacherReview,
  toPortableLearnerResponse,
} from "./core/interchange.js";
import {
  findLearnerResponse,
  parseLearnerResponseCollection,
  removeLearnerResponsesForMaterial,
  upsertLearnerResponse,
} from "./core/learning-records.js";
import {
  findTeacherReviewForResponse,
  parseTeacherReviewCollection,
  upsertTeacherReview,
} from "./core/review-records.js";
import { CURRENT_SCHEMA_VERSION, normalizeLibrary, normalizePaper } from "./core/migrations.js";
import {
  addTranslationItem,
  createTranslationDocument,
  createTranslationFolder,
  deleteTranslationDocument,
  deleteTranslationFolder,
  getTranslationDocument,
  getTranslationFolder,
  parseTranslationLibrary,
  removeTranslationItem,
  reorderTranslationItems,
  updateTranslationDocument,
  updateTranslationFolder,
  updateTranslationItem,
} from "./core/translation-domain.js";
import {
  findDocumentIdCollision,
  parseBilingualText,
  parseSourceOnlyText,
  parseTranslationDocumentJsonText,
  remapDocumentForCopy,
} from "./core/translation-import.js";
import {
  addTranslationAnnotation,
  changeTranslationAnnotationKind,
  createTranslationSession,
  goToTranslationIndex,
  isTranslationSessionForDocument,
  normalizeTranslationSession,
  removeTranslationAnnotation,
  setTranslationAnswer,
  setTranslationRevealed,
} from "./core/translation-session.js";
import {
  QUESTION_TYPES,
  clonePaperForLibrary,
  cloneQuestion,
  convertQuestionType,
  createQuestion,
  ensureChoiceValidity,
  isAnswerComplete,
  isQuestionReady,
  prepareQuizQuestion,
} from "./core/question-registry.js";
import { makeId, parseTags, safeFileName } from "./core/utils.js";
import { STORAGE_KEYS, loadJson, removeStoredValue, saveJson } from "./storage/local-storage.js";

const {
  LEGACY_PAPER: LEGACY_STORAGE_KEY,
  LIBRARY: LIBRARY_KEY,
  ACTIVE_PAPER: ACTIVE_PAPER_KEY,
  ACTIVE_SESSION: ACTIVE_SESSION_KEY,
  TRANSLATION_ACTIVE_SESSION: TRANSLATION_ACTIVE_SESSION_KEY,
  HISTORY: HISTORY_KEY,
  LEARNER_RESPONSES: LEARNER_RESPONSES_KEY,
  TEACHER_REVIEWS: TEACHER_REVIEWS_KEY,
  TRANSLATION_LIBRARY: TRANSLATION_LIBRARY_KEY,
  THEME: THEME_KEY,
  LANGUAGE: LANG_KEY,
} = STORAGE_KEYS;

const locales = {
  zh: {
    code: "zh-CN",
    name: "中文",
    tagline: "编辑试卷，马上练习",
    aria: {
      mainMode: "主要模式",
      theme: "切换亮色和暗色背景",
      language: "界面语言",
      skip: "跳到主要内容",
    },
    modes: {
      edit: "编辑",
      quiz: "做题",
      translation: "翻译练习",
    },
    library: {
      title: "本地试卷库",
      search: "搜索标题、分类或标签",
      empty: "没有匹配的试卷",
      newPaper: "新建",
      duplicatePaper: "复制",
      renamePaper: "重命名",
      deletePaper: "删除",
      exportBackup: "备份",
      importBackup: "导入备份",
      active: "当前",
      category: "分类",
      tags: "标签",
      recent: "最近打开",
      updated: "更新",
      untitled: "未命名试卷",
      defaultCategory: "默认",
      tagHint: "用逗号分隔多个标签",
      renamePrompt: "输入新的试卷名称",
      deleteConfirm: "确定删除这套试卷吗？此操作只影响浏览器本地数据。",
      backupImported: "已导入备份",
      paperImported: "已导入试卷",
      backupImportFail: "导入失败，请选择有效的试卷或备份 JSON 文件。",
      backupExportFail: "备份失败，请检查本地作答记录是否完整。",
      copySuffix: "副本",
    },
    paper: {
      title: "试卷名称",
      description: "说明",
      category: "分类",
      tags: "标签",
      unnamedPaper: "未命名试卷",
      ready: "准备开始答题。",
    },
    actions: {
      export: "导出",
      import: "导入",
      duplicate: "复制",
      delete: "删除",
      addOption: "添加选项",
      addPair: "添加配对",
      startQuiz: "开始做题",
      resumeQuiz: "继续上次进度",
      startWrongQuiz: "错题重练",
      backToEdit: "返回编辑",
      quit: "退出",
      submitAnswer: "提交答案",
      viewResults: "查看结果",
      nextQuestion: "下一题",
      previousQuestion: "上一题",
      retry: "再做一次",
      clearHistory: "清空记录",
      exportResponse: "导出作答记录",
    },
    practice: {
      setupTitle: "练习设置",
      typeFilter: "题型筛选",
      randomCount: "随机抽题数量",
      randomHint: "留空或 0 表示使用全部符合条件的题目",
      recoverTitle: "发现未完成练习",
      recoverBody: "可以继续上次刷新前的答题进度。",
      historyTitle: "答题历史",
      noHistory: "还没有答题记录",
      lastScore: "最近成绩",
      questionCount: "{count} 题",
      unanswered: "未答 {count} 题",
      answered: "已答 {count} / {total}",
      noWrongQuestions: "最近没有可重练的错题",
      allTypes: "全部题型",
      evidenceSaved: "原始作答已作为独立学习记录保存在本机。",
      clearHistoryConfirm: "确定清空这套试卷的答题历史和对应原始作答记录吗？此操作无法撤销。",
    },
    question: {
      listTitle: "题目",
      emptyList: "还没有题目",
      emptyListHint: "从上方添加一种题型开始",
      chooseOne: "请选择或添加一道题目",
      unnamed: "未命名题目",
      prompt: "题目内容",
      type: "题型",
      option: "选项 {letter}",
      markCorrect: "标记为正确答案",
      acceptedAnswers: "可接受答案",
      caseSensitive: "区分英文大小写",
      correctAnswer: "正确答案",
      leftItem: "左侧项目 {number}",
      rightItem: "右侧答案 {number}",
      yourAnswer: "你的答案",
      choose: "请选择",
      true: "正确",
      false: "错误",
      progress: "第 {current} / {total} 题",
    },
    types: {
      single: "单选题",
      multiple: "多选题",
      blank: "填空题",
      truefalse: "判断题",
      matching: "匹配题",
    },
    shortTypes: {
      single: "单选",
      multiple: "多选",
      blank: "填空",
      truefalse: "判断",
      matching: "匹配",
    },
    result: {
      complete: "答题完成",
      score: "{correct} / {total} 题正确",
      correct: "答对",
      wrong: "答错",
      correctFeedback: "答对了",
      wrongFeedback: "答错了",
      correctAnswer: "正确答案",
      yourAnswer: "你的答案",
      noAnswer: "未作答",
      acceptedAnswers: "可接受答案",
      correctPairs: "正确配对",
      separator: "、",
      pairSeparator: "；",
    },
    toast: {
      noReadyQuestions: "还没有可作答的完整题目，请先检查题目和答案。",
      noFilteredQuestions: "没有符合筛选条件的完整题目。",
      answerRequired: "请先完成当前题目，再提交答案。",
      sessionSaved: "练习进度已自动保存",
      sessionResumed: "已恢复上次练习进度",
      added: "已添加{type}",
      duplicated: "已复制题目",
      deleted: "已删除题目",
      paperCreated: "已新建试卷",
      paperDuplicated: "已复制试卷",
      paperRenamed: "已重命名试卷",
      paperDeleted: "已删除试卷",
      importSuccess: "导入成功",
      importFail: "导入失败，请选择正确的 JSON 试卷文件。",
      unsupportedLanguage: "暂不支持该语言。",
      historyCleared: "答题历史和作答记录已清空",
      responseSaveFail: "无法保存原始作答记录。请检查浏览器存储空间后重试。",
      responseExportFail: "无法导出作答记录。",
      historySaveFail: "原始作答已保存，但成绩摘要无法写入本地历史。",
      translationFolderCreated: "已新建文件夹",
      translationFolderRenamed: "已重命名文件夹",
      translationFolderDeleted: "已删除文件夹",
      translationDocumentCreated: "已新建翻译文档",
      translationDocumentDeleted: "已删除翻译文档",
      translationDocumentFieldsRequired: "请填写标题、原文语言和译文语言。",
      translationItemDeleted: "已删除条目",
      translationImportSuccess: "已导入翻译文档",
      translationImportFail: "导入失败，请检查文件内容或所选文件夹。",
      translationPracticeDiscarded: "已放弃本次翻译练习",
      translationResponseSaveFail: "无法保存翻译作答记录，请检查浏览器存储空间后重试。",
      translationPracticeSaved: "翻译练习已完成，原始作答已保存。",
      translationAnnotationsInvalidated: "答案已修改，对应位置的标记已自动移除。",
      translationAnnotationSelectionRequired: "请先在译文中选中一段文字，再进行标记。",
      translationAnnotationOverlap: "该范围与已有标记重叠，请先移除或调整已有标记。",
      correctionSelectionRequired: "请先在原始作答中选中一段文字，再进行批改。",
      correctionConflict: "该范围与已有的修改类批改（插入/替换/删除）冲突，请先移除或调整已有批改。",
      correctionReviewSaved: "批改已保存。",
      correctionReviewSaveFail: "无法保存批改，请检查浏览器存储空间后重试。",
      correctionResponseNotFound: "未找到对应的原始作答记录，无法打开批改工作区。",
    },
    translationPractice: {
      recoverTitle: "发现未完成的翻译练习",
      recoverBody: "可以继续上次的翻译进度，或放弃后重新开始。",
      resume: "继续练习",
      discard: "放弃练习",
      discardConfirm: "确定放弃这次未完成的翻译练习吗？已填写的内容将被清除，且无法恢复。",
      overwriteConfirm: "已有另一份文档的未完成翻译练习。开始新的练习会放弃它，是否继续？",
      start: "开始练习",
      exit: "退出练习",
      progress: "第 {current} / {total} 条",
      answered: "已填写 {count} / {total}",
      sourceLabel: "原文",
      yourTranslation: "你的译文",
      revealReference: "显示参考译文",
      hideReference: "隐藏参考译文",
      referenceLabel: "参考译文",
      finish: "完成练习",
      completeTitle: "练习完成",
      completeSummary: "共 {count} 条翻译",
      backToDocument: "返回文档",
      practiceAgain: "再练一次",
      markSelectionAs: "把选中内容标记为",
      noAnnotations: "还没有标记",
      kind: {
        unknown: "不认识",
        uncertain: "不确定",
        should_know: "应该会但想不起来",
      },
    },
    review: {
      openWorkspace: "打开批改工作区",
      workspaceTitle: "批改 / 修订工作区",
      back: "返回",
      responseNotFound: "未找到对应的原始作答记录。",
      originalAnswer: "学习者原始作答（不可编辑）",
      learnerMarks: "学习者标记",
      applyCorrection: "把选中内容",
      bold: "加粗",
      italic: "斜体",
      underline: "下划线",
      strikethrough: "删除线",
      highlight: "高亮",
      bracket: "加括号",
      textColor: "文字颜色",
      insert: "插入",
      replace: "替换",
      delete: "删除/划掉",
      addComment: "添加批注",
      insertPrompt: "输入要插入的文字",
      replacePrompt: "输入替换后的文字",
      commentPrompt: "输入批注内容",
      preview: "批改后预览",
      noCorrections: "还没有批改",
      judgment: "评判（可选）",
      judgmentNone: "不设置",
      judgmentCorrect: "正确",
      judgmentIncorrect: "错误",
      judgmentPartial: "部分正确",
      judgmentNeedsReview: "待复核",
      itemComment: "该条目的批注",
      suggestedRevision: "建议的整体修订译文（可选）",
      save: "保存批改",
      finalizedResponses: "已完成的作答记录",
      color: {
        red: "红色",
        blue: "蓝色",
        green: "绿色",
        purple: "紫色",
        orange: "橙色",
        teal: "青色",
        brown: "棕色",
      },
      styleType: {
        bold: "加粗",
        italic: "斜体",
        underline: "下划线",
        strikethrough: "删除线",
        highlight: "高亮",
        bracket: "加括号",
        color: "文字颜色",
      },
      operation: {
        insert: "插入",
        replace: "替换",
        delete: "删除",
        comment: "批注",
      },
    },
    translation: {
      title: "翻译练习库",
      newFolder: "新建文件夹",
      newFolderPrompt: "输入文件夹名称",
      renameFolder: "重命名",
      renameFolderPrompt: "输入新的文件夹名称",
      deleteFolder: "删除",
      deleteFolderConfirm: "确定删除这个文件夹吗？其中的翻译文档也会一并删除。此操作只影响浏览器本地数据。",
      emptyFolders: "还没有文件夹，请先新建一个。",
      documentsIn: "{count} 份文档",
      newDocument: "新建文档",
      selectDocument: "请选择或导入一份翻译文档",
      sourceLanguage: "原文语言",
      targetLanguage: "译文语言",
      itemCount: "{count} 条",
      items: "条目",
      emptyItems: "还没有条目",
      addItem: "添加条目",
      newItemPlaceholder: "新条目内容",
      sourceText: "原文",
      referenceTranslation: "参考译文（可选）",
      notes: "备注（可选）",
      moveDocument: "所属文件夹",
      exportDocument: "导出文档 JSON",
      deleteDocument: "删除文档",
      deleteDocumentConfirm: "确定删除这份翻译文档吗？此操作只影响浏览器本地数据。",
      importSection: "导入材料",
      importSourceOnly: "仅原文批量导入",
      importSourceOnlyHint: "每行一条，仅原文，不含参考译文。",
      importBilingual: "双语批量导入",
      importBilingualHint: "每行一条，格式为「原文<Tab>参考译文」。",
      importJson: "导入翻译文档 JSON",
      documentTitleLabel: "文档标题",
      importTargetFolder: "目标文件夹",
      importTextLabel: "粘贴内容",
      importPreviewButton: "预览",
      importAsCopy: "作为新副本导入（重新分配 ID）",
      importPreviewTitle: "导入预览",
      importConfirm: "确认导入",
      importCancel: "取消",
      importErrors: "校验错误",
      importNeedFolder: "请先新建并选择一个文件夹。",
      importCollision: "该文档 ID 已存在，请勾选“作为新副本导入”，或更换文件。",
      importTitleRequired: "请输入文档标题。",
      importSourceLanguageRequired: "请输入原文语言。",
      importTargetLanguageRequired: "请输入译文语言。",
      hasReference: "含参考译文",
      noReference: "不含参考译文",
    },
    samplePaper: {
      title: "第一份 Quiz 试卷",
      description: "这是一份示例试卷。你可以在编辑页替换题目、答案和选项。",
      q1: "下面哪个选项是 JavaScript 中用于声明常量的关键字？",
      q2: "下面哪些题型已经在这个系统第一版中支持？",
      q3: "请输入英文单词 quiz 的中文常见含义。",
      q4: "单选题和多选题在第二次开始做题时可以重新打乱选项顺序。",
      q5: "把题型和它的答题方式匹配起来。",
      autoEssay: "作文自动批改",
      quizMeaning1: "测验",
      quizMeaning2: "小测验",
      judgeWay: "选择正确或错误",
      blankWay: "输入文字答案",
      matchWay: "连接一对一答案",
    },
  },
  en: {
    code: "en",
    name: "English",
    tagline: "Edit papers and practice right away",
    aria: {
      mainMode: "Main mode",
      theme: "Switch light and dark background",
      language: "Interface language",
      skip: "Skip to main content",
    },
    modes: {
      edit: "Edit",
      quiz: "Quiz",
      translation: "Translation",
    },
    library: {
      title: "Local quiz library",
      search: "Search title, category, or tags",
      empty: "No matching papers",
      newPaper: "New",
      duplicatePaper: "Duplicate",
      renamePaper: "Rename",
      deletePaper: "Delete",
      exportBackup: "Backup",
      importBackup: "Import backup",
      active: "Current",
      category: "Category",
      tags: "Tags",
      recent: "Recent",
      updated: "Updated",
      untitled: "Untitled paper",
      defaultCategory: "Default",
      tagHint: "Separate tags with commas",
      renamePrompt: "Enter a new paper name",
      deleteConfirm: "Delete this paper? This only affects local browser data.",
      backupImported: "Backup imported",
      paperImported: "Paper imported",
      backupImportFail: "Import failed. Choose a valid paper or backup JSON file.",
      backupExportFail: "Backup failed. Check that local learner-response records are valid.",
      copySuffix: "Copy",
    },
    paper: {
      title: "Paper title",
      description: "Description",
      category: "Category",
      tags: "Tags",
      unnamedPaper: "Untitled paper",
      ready: "Ready to start.",
    },
    actions: {
      export: "Export",
      import: "Import",
      duplicate: "Duplicate",
      delete: "Delete",
      addOption: "Add option",
      addPair: "Add pair",
      startQuiz: "Start quiz",
      resumeQuiz: "Resume progress",
      startWrongQuiz: "Retry wrong",
      backToEdit: "Back to edit",
      quit: "Quit",
      submitAnswer: "Submit answer",
      viewResults: "View results",
      nextQuestion: "Next question",
      previousQuestion: "Previous",
      retry: "Try again",
      clearHistory: "Clear history",
      exportResponse: "Export response",
    },
    practice: {
      setupTitle: "Practice setup",
      typeFilter: "Question type filter",
      randomCount: "Random question count",
      randomHint: "Leave blank or 0 to use all matching questions",
      recoverTitle: "Unfinished practice found",
      recoverBody: "You can continue the progress saved before refresh.",
      historyTitle: "Answer history",
      noHistory: "No answer history yet",
      lastScore: "Latest score",
      questionCount: "{count} questions",
      unanswered: "{count} unanswered",
      answered: "{count} / {total} answered",
      noWrongQuestions: "No wrong questions are available from recent attempts",
      allTypes: "All types",
      evidenceSaved: "The original response is stored locally as a separate learning record.",
      clearHistoryConfirm: "Clear this paper's answer history and corresponding original response records? This cannot be undone.",
    },
    question: {
      listTitle: "Questions",
      emptyList: "No questions yet",
      emptyListHint: "Add a question type above",
      chooseOne: "Select or add a question",
      unnamed: "Untitled question",
      prompt: "Question prompt",
      type: "Question type",
      option: "Option {letter}",
      markCorrect: "Mark as correct answer",
      acceptedAnswers: "Accepted answers",
      caseSensitive: "Case-sensitive",
      correctAnswer: "Correct answer",
      leftItem: "Left item {number}",
      rightItem: "Right answer {number}",
      yourAnswer: "Your answer",
      choose: "Choose",
      true: "True",
      false: "False",
      progress: "Question {current} / {total}",
    },
    types: {
      single: "Single choice",
      multiple: "Multiple choice",
      blank: "Blank",
      truefalse: "True/False",
      matching: "Matching",
    },
    shortTypes: {
      single: "Single",
      multiple: "Multiple",
      blank: "Blank",
      truefalse: "Judge",
      matching: "Match",
    },
    result: {
      complete: "Quiz complete",
      score: "{correct} / {total} correct",
      correct: "Correct",
      wrong: "Wrong",
      correctFeedback: "Correct",
      wrongFeedback: "Wrong",
      correctAnswer: "Correct answer",
      yourAnswer: "Your answer",
      noAnswer: "No answer",
      acceptedAnswers: "Accepted answers",
      correctPairs: "Correct pairs",
      separator: ", ",
      pairSeparator: "; ",
    },
    toast: {
      noReadyQuestions: "No complete questions are ready yet. Please check prompts and answers first.",
      noFilteredQuestions: "No complete questions match the selected filters.",
      answerRequired: "Please answer the current question before submitting.",
      sessionSaved: "Practice progress saved automatically",
      sessionResumed: "Practice progress resumed",
      added: "Added {type}",
      duplicated: "Question duplicated",
      deleted: "Question deleted",
      paperCreated: "Paper created",
      paperDuplicated: "Paper duplicated",
      paperRenamed: "Paper renamed",
      paperDeleted: "Paper deleted",
      importSuccess: "Import complete",
      importFail: "Import failed. Please choose a valid JSON paper file.",
      unsupportedLanguage: "This language is not supported yet.",
      historyCleared: "Answer history and response records cleared",
      responseSaveFail: "The original response could not be saved. Check browser storage space and try again.",
      responseExportFail: "The learner response could not be exported.",
      historySaveFail: "The original response was saved, but the score summary could not be added to local history.",
      translationFolderCreated: "Folder created",
      translationFolderRenamed: "Folder renamed",
      translationFolderDeleted: "Folder deleted",
      translationDocumentCreated: "Translation document created",
      translationDocumentDeleted: "Translation document deleted",
      translationDocumentFieldsRequired: "Enter a title, source language, and target language.",
      translationItemDeleted: "Item deleted",
      translationImportSuccess: "Translation document imported",
      translationImportFail: "Import failed. Check the file content or the selected folder.",
      translationPracticeDiscarded: "Translation practice discarded",
      translationResponseSaveFail: "The translation response could not be saved. Check browser storage space and try again.",
      translationPracticeSaved: "Translation practice complete. The original response has been saved.",
      translationAnnotationsInvalidated: "The answer changed, so the mark(s) anchored to that text were removed automatically.",
      translationAnnotationSelectionRequired: "Select some text in your translation first, then mark it.",
      translationAnnotationOverlap: "This range overlaps an existing mark. Remove or adjust the existing mark first.",
      correctionSelectionRequired: "Select some text in the original answer first, then apply a correction.",
      correctionConflict: "This range conflicts with an existing content-changing correction (insert/replace/delete). Remove or adjust the existing correction first.",
      correctionReviewSaved: "Review saved.",
      correctionReviewSaveFail: "The review could not be saved. Check browser storage space and try again.",
      correctionResponseNotFound: "The original response could not be found, so the Correction Workspace could not be opened.",
    },
    translationPractice: {
      recoverTitle: "Unfinished translation practice found",
      recoverBody: "You can continue the saved translation progress, or discard it and start over.",
      resume: "Resume practice",
      discard: "Discard practice",
      discardConfirm: "Discard this unfinished translation practice? Entered text will be cleared and cannot be recovered.",
      overwriteConfirm: "Another document has unfinished translation practice. Starting new practice will discard it. Continue?",
      start: "Start practice",
      exit: "Exit practice",
      progress: "Item {current} / {total}",
      answered: "{count} / {total} entered",
      sourceLabel: "Source",
      yourTranslation: "Your translation",
      revealReference: "Show reference translation",
      hideReference: "Hide reference translation",
      referenceLabel: "Reference translation",
      finish: "Finish practice",
      completeTitle: "Practice complete",
      completeSummary: "{count} translation items",
      backToDocument: "Back to document",
      practiceAgain: "Practice again",
      markSelectionAs: "Mark selection as",
      noAnnotations: "No marks yet",
      kind: {
        unknown: "Unknown",
        uncertain: "Uncertain",
        should_know: "Should know",
      },
    },
    review: {
      openWorkspace: "Open Correction Workspace",
      workspaceTitle: "Correction / Revision Workspace",
      back: "Back",
      responseNotFound: "The original response could not be found.",
      originalAnswer: "Learner's original answer (read-only)",
      learnerMarks: "Learner marks",
      applyCorrection: "Apply to the selection:",
      bold: "Bold",
      italic: "Italic",
      underline: "Underline",
      strikethrough: "Strikethrough",
      highlight: "Highlight",
      bracket: "Bracket",
      textColor: "Text color",
      insert: "Insert",
      replace: "Replace",
      delete: "Delete",
      addComment: "Add comment",
      insertPrompt: "Enter the text to insert",
      replacePrompt: "Enter the replacement text",
      commentPrompt: "Enter the comment",
      preview: "Corrected preview",
      noCorrections: "No corrections yet",
      judgment: "Judgment (optional)",
      judgmentNone: "None",
      judgmentCorrect: "Correct",
      judgmentIncorrect: "Incorrect",
      judgmentPartial: "Partial",
      judgmentNeedsReview: "Needs review",
      itemComment: "Comment for this item",
      suggestedRevision: "Suggested whole-answer revision (optional)",
      save: "Save review",
      finalizedResponses: "Finalized responses",
      color: {
        red: "Red",
        blue: "Blue",
        green: "Green",
        purple: "Purple",
        orange: "Orange",
        teal: "Teal",
        brown: "Brown",
      },
      styleType: {
        bold: "Bold",
        italic: "Italic",
        underline: "Underline",
        strikethrough: "Strikethrough",
        highlight: "Highlight",
        bracket: "Bracket",
        color: "Text color",
      },
      operation: {
        insert: "Insert",
        replace: "Replace",
        delete: "Delete",
        comment: "Comment",
      },
    },
    translation: {
      title: "Translation Library",
      newFolder: "New folder",
      newFolderPrompt: "Enter a folder name",
      renameFolder: "Rename",
      renameFolderPrompt: "Enter a new folder name",
      deleteFolder: "Delete",
      deleteFolderConfirm: "Delete this folder? Its Translation Documents will also be deleted. This only affects local browser data.",
      emptyFolders: "No folders yet. Create one first.",
      documentsIn: "{count} documents",
      newDocument: "New document",
      selectDocument: "Select or import a Translation Document",
      sourceLanguage: "Source language",
      targetLanguage: "Target language",
      itemCount: "{count} items",
      items: "Items",
      emptyItems: "No items yet",
      addItem: "Add item",
      newItemPlaceholder: "New item text",
      sourceText: "Source text",
      referenceTranslation: "Reference translation (optional)",
      notes: "Notes (optional)",
      moveDocument: "Folder",
      exportDocument: "Export document JSON",
      deleteDocument: "Delete document",
      deleteDocumentConfirm: "Delete this Translation Document? This only affects local browser data.",
      importSection: "Import material",
      importSourceOnly: "Source-only batch import",
      importSourceOnlyHint: "One line = one item, source text only.",
      importBilingual: "Bilingual batch import",
      importBilingualHint: "One line = one item, format: source<TAB>reference.",
      importJson: "Import Translation Document JSON",
      documentTitleLabel: "Document title",
      importTargetFolder: "Target folder",
      importTextLabel: "Paste content",
      importPreviewButton: "Preview",
      importAsCopy: "Import as a new copy (reassign IDs)",
      importPreviewTitle: "Import preview",
      importConfirm: "Confirm import",
      importCancel: "Cancel",
      importErrors: "Validation errors",
      importNeedFolder: "Create and choose a folder first.",
      importCollision: "This document ID already exists. Check \"import as a new copy\" or choose another file.",
      importTitleRequired: "Enter a document title.",
      importSourceLanguageRequired: "Enter a source language.",
      importTargetLanguageRequired: "Enter a target language.",
      hasReference: "Has reference translations",
      noReference: "No reference translations",
    },
    samplePaper: {
      title: "First Quiz Paper",
      description: "This is a sample paper. You can replace questions, answers, and options in the editor.",
      q1: "Which keyword declares a constant in JavaScript?",
      q2: "Which question types are supported in the first version of this system?",
      q3: "Enter a common Chinese meaning of the English word quiz.",
      q4: "Single-choice and multiple-choice options can be shuffled when starting the quiz again.",
      q5: "Match each question type with its answer method.",
      autoEssay: "Automatic essay grading",
      quizMeaning1: "测验",
      quizMeaning2: "小测验",
      judgeWay: "Choose true or false",
      blankWay: "Type a text answer",
      matchWay: "Connect one-to-one answers",
    },
  },
};

let language = loadLanguage();
let library = loadLibrary();
let activePaperId = loadActivePaperId();
let paper = getActivePaper();
let selectedQuestionId = paper.questions[0]?.id ?? null;
let currentMode = "edit";
let session = loadActiveSession();
let toastTimer = null;
let librarySearch = "";
let translationLibrary = loadTranslationLibrary();
let translationSession = loadActiveTranslationSession();
let selectedTranslationDocumentId = translationSession && !translationSession.completed
  && translationLibrary.documents.some((doc) => doc.id === translationSession.documentId)
  ? translationSession.documentId
  : null;
let translationPracticeActive = false;
let translationImportDraft = null;
let translationLastResponseId = null;
let correctionWorkspaceResponseId = null;
let correctionReviewDraft = null;
let correctionItemIndex = 0;

const editorView = document.getElementById("editorView");
const quizView = document.getElementById("quizView");
const translationView = document.getElementById("translationView");
const translationModeButton = document.getElementById("translationModeButton");
const translationLibraryPanel = document.getElementById("translationLibraryPanel");
const translationDocumentPanel = document.getElementById("translationDocumentPanel");
const skipLink = document.getElementById("skipLink");
const editModeButton = document.getElementById("editModeButton");
const quizModeButton = document.getElementById("quizModeButton");
const themeToggle = document.getElementById("themeToggle");
const languageSelect = document.getElementById("languageSelect");
const libraryPanel = document.getElementById("libraryPanel");
const paperTitle = document.getElementById("paperTitle");
const paperDescription = document.getElementById("paperDescription");
const paperCategory = document.getElementById("paperCategory");
const paperTags = document.getElementById("paperTags");
const questionCount = document.getElementById("questionCount");
const questionListTitle = document.getElementById("questionListTitle");
const questionList = document.getElementById("questionList");
const questionEditor = document.getElementById("questionEditor");
const quizPanel = document.getElementById("quizPanel");
const exportButton = document.getElementById("exportButton");
const importInput = document.getElementById("importInput");
const importLabelText = document.getElementById("importLabelText");
const toast = document.getElementById("toast");

init();

function init() {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.lang = locales[language].code;
  bindGlobalEvents();
  registerServiceWorker();
  renderAll();
}

function bindGlobalEvents() {
  editModeButton.addEventListener("click", () => setMode("edit"));
  quizModeButton.addEventListener("click", () => setMode("quiz"));
  translationModeButton.addEventListener("click", () => setMode("translation"));
  themeToggle.addEventListener("click", toggleTheme);

  languageSelect.addEventListener("change", (event) => setLanguage(event.target.value));

  paperTitle.addEventListener("input", () => {
    paper.title = paperTitle.value;
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  paperDescription.addEventListener("input", () => {
    paper.description = paperDescription.value;
    savePaper({ clearSession: false });
  });

  paperCategory.addEventListener("input", () => {
    paper.category = paperCategory.value;
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  paperTags.addEventListener("input", () => {
    paper.tags = parseTags(paperTags.value);
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.addEventListener("click", () => addQuestion(button.dataset.addType));
  });

  exportButton.addEventListener("click", exportPaper);
  importInput.addEventListener("change", importPaper);
}

function renderAll() {
  paper = getActivePaper();
  renderChrome();
  renderLibraryPanel();
  paperTitle.value = paper.title;
  paperDescription.value = paper.description;
  paperCategory.value = paper.category || "";
  paperTags.value = (paper.tags || []).join(", ");
  renderQuestionList();
  renderQuestionEditor();
  renderQuizStart();
  renderTranslationView();
}

function renderChrome() {
  document.documentElement.lang = locales[language].code;
  document.querySelector(".brand p").textContent = t("tagline");
  skipLink.textContent = t("aria.skip");
  document.querySelector(".mode-tabs").setAttribute("aria-label", t("aria.mainMode"));
  editModeButton.textContent = t("modes.edit");
  quizModeButton.textContent = t("modes.quiz");
  translationModeButton.textContent = t("modes.translation");
  themeToggle.title = t("aria.theme");
  themeToggle.setAttribute("aria-label", t("aria.theme"));
  languageSelect.setAttribute("aria-label", t("aria.language"));
  languageSelect.value = language;
  document.querySelector("[data-label='paper-title']").textContent = t("paper.title");
  document.querySelector("[data-label='paper-description']").textContent = t("paper.description");
  document.querySelector("[data-label='paper-category']").textContent = t("paper.category");
  document.querySelector("[data-label='paper-tags']").textContent = t("paper.tags");
  paperTags.placeholder = t("library.tagHint");
  questionListTitle.textContent = t("question.listTitle");
  exportButton.textContent = t("actions.export");
  importLabelText.textContent = t("actions.import");

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.textContent = typeShortLabel(button.dataset.addType);
  });
}

function setMode(mode) {
  currentMode = mode;
  editorView.classList.toggle("hidden", mode !== "edit");
  quizView.classList.toggle("hidden", mode !== "quiz");
  translationView.classList.toggle("hidden", mode !== "translation");
  editModeButton.classList.toggle("active", mode === "edit");
  quizModeButton.classList.toggle("active", mode === "quiz");
  translationModeButton.classList.toggle("active", mode === "translation");
  if (mode === "quiz") renderQuizStart();
  if (mode === "translation") renderTranslationView();
}

function setLanguage(nextLanguage) {
  if (!locales[nextLanguage]) {
    showToast(t("toast.unsupportedLanguage"));
    languageSelect.value = language;
    return;
  }

  language = nextLanguage;
  localStorage.setItem(LANG_KEY, language);
  renderAll();
}

function renderLibraryPanel() {
  const query = librarySearch.trim().toLowerCase();
  const papers = [...library.papers]
    .sort((first, second) => new Date(second.lastOpenedAt || second.updatedAt) - new Date(first.lastOpenedAt || first.updatedAt))
    .filter((item) => {
      const haystack = [item.title, item.category, ...(item.tags || [])].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

  libraryPanel.innerHTML = `
    <div class="library-heading">
      <strong>${t("library.title")}</strong>
      <span>${library.papers.length}</span>
    </div>
    <input id="librarySearch" type="search" value="${escapeHtml(librarySearch)}" placeholder="${t("library.search")}">
    <div class="library-actions">
      <button class="small-button" type="button" id="newPaper">${t("library.newPaper")}</button>
      <button class="small-button" type="button" id="duplicatePaper">${t("library.duplicatePaper")}</button>
      <button class="small-button" type="button" id="renamePaper">${t("library.renamePaper")}</button>
      <button class="danger-button small-button" type="button" id="deletePaper">${t("library.deletePaper")}</button>
    </div>
    <div class="library-list">
      ${papers.length ? papers.map(renderLibraryItem).join("") : `<div class="library-empty">${t("library.empty")}</div>`}
    </div>
    <div class="utility-row">
      <button class="secondary-button" id="exportBackup" type="button">${t("library.exportBackup")}</button>
      <label class="secondary-button file-label">
        <span>${t("library.importBackup")}</span>
        <input id="backupInput" type="file" accept="application/json,.json">
      </label>
    </div>
  `;

  document.getElementById("librarySearch").addEventListener("input", (event) => {
    librarySearch = event.target.value;
    renderLibraryPanel();
  });
  document.getElementById("newPaper").addEventListener("click", createLibraryPaper);
  document.getElementById("duplicatePaper").addEventListener("click", duplicateLibraryPaper);
  document.getElementById("renamePaper").addEventListener("click", renameLibraryPaper);
  document.getElementById("deletePaper").addEventListener("click", deleteLibraryPaper);
  document.getElementById("exportBackup").addEventListener("click", exportLibraryBackup);
  document.getElementById("backupInput").addEventListener("change", importLibraryBackup);

  libraryPanel.querySelectorAll("[data-open-paper]").forEach((button) => {
    button.addEventListener("click", () => openLibraryPaper(button.dataset.openPaper));
  });
}

function renderLibraryItem(item) {
  const isActive = item.id === activePaperId;
  const tags = (item.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `
    <button class="library-item ${isActive ? "active" : ""}" type="button" data-open-paper="${item.id}">
      <span>
        <strong>${escapeHtml(item.title || t("library.untitled"))}</strong>
        <small>${escapeHtml(item.category || t("library.defaultCategory"))} · ${t("library.updated")} ${formatDate(item.updatedAt)}</small>
      </span>
      <span class="library-tags">${tags}${isActive ? `<span>${t("library.active")}</span>` : ""}</span>
    </button>
  `;
}

function createLibraryPaper() {
  const nextPaper = normalizePaper({
    id: makeId(),
    title: t("library.untitled"),
    description: "",
    category: "",
    tags: [],
    questions: [],
  });
  library.papers.push(nextPaper);
  activePaperId = nextPaper.id;
  localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
  selectedQuestionId = null;
  clearActiveSession();
  saveLibrary();
  renderAll();
  showToast(t("toast.paperCreated"));
}

function duplicateLibraryPaper() {
  const copy = clonePaperForLibrary(paper);
  copy.title = `${paper.title || t("library.untitled")} ${t("library.copySuffix")}`;
  library.papers.push(copy);
  activePaperId = copy.id;
  localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
  selectedQuestionId = copy.questions[0]?.id ?? null;
  clearActiveSession();
  saveLibrary();
  renderAll();
  showToast(t("toast.paperDuplicated"));
}

function renameLibraryPaper() {
  const nextTitle = window.prompt(t("library.renamePrompt"), paper.title || t("library.untitled"));
  if (!nextTitle) return;
  paper.title = nextTitle.trim();
  savePaper({ clearSession: false });
  renderAll();
  showToast(t("toast.paperRenamed"));
}

function deleteLibraryPaper() {
  if (!window.confirm(t("library.deleteConfirm"))) return;
  library.papers = library.papers.filter((item) => item.id !== activePaperId);
  if (!library.papers.length) library.papers.push(normalizePaper(createDefaultPaper()));
  activePaperId = library.papers[0].id;
  localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
  paper = getActivePaper();
  selectedQuestionId = paper.questions[0]?.id ?? null;
  clearActiveSession();
  saveLibrary();
  renderAll();
  showToast(t("toast.paperDeleted"));
}

function openLibraryPaper(id) {
  if (id === activePaperId) return;
  activePaperId = id;
  localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
  paper = getActivePaper();
  paper.lastOpenedAt = new Date().toISOString();
  selectedQuestionId = paper.questions[0]?.id ?? null;
  session = loadActiveSession();
  saveLibrary();
  renderAll();
}

function renderQuestionList() {
  questionCount.textContent = paper.questions.length;

  if (!paper.questions.length) {
    questionList.innerHTML = `
      <div class="empty-state compact-empty">
        <div>${t("question.emptyList")}<br>${t("question.emptyListHint")}</div>
      </div>
    `;
    return;
  }

  questionList.innerHTML = paper.questions
    .map((question, index) => {
      const title = question.prompt.trim() || t("question.unnamed");
      return `
        <button class="question-item ${question.id === selectedQuestionId ? "active" : ""}" type="button" data-select-question="${question.id}">
          <span class="question-title">
            <strong>${index + 1}. ${escapeHtml(title)}</strong>
            <span>${typeLabel(question.type)}</span>
          </span>
          <span class="type-pill">${typeShortLabel(question.type)}</span>
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
    questionEditor.innerHTML = `<div class="empty-state"><div>${t("question.chooseOne")}</div></div>`;
    return;
  }

  questionEditor.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${typeLabel(question.type)}</span>
        <div class="row-actions">
          <button class="small-button" type="button" id="duplicateQuestion">${t("actions.duplicate")}</button>
          <button class="danger-button small-button" type="button" id="deleteQuestion">${t("actions.delete")}</button>
        </div>
      </div>
      <div class="editor-heading">
        <div class="field-grid">
          <label>
            <span>${t("question.prompt")}</span>
            <textarea id="questionPrompt" rows="4">${escapeHtml(question.prompt)}</textarea>
          </label>
          <label>
            <span>${t("question.type")}</span>
            <select id="questionType">
              ${QUESTION_TYPES.map((value) => `<option value="${value}" ${question.type === value ? "selected" : ""}>${typeLabel(value)}</option>`).join("")}
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
      .map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        return `
          <div class="option-row" data-option-id="${option.id}">
            <label class="correct-toggle" title="${t("question.markCorrect")}">
              <input type="${question.type === "single" ? "radio" : "checkbox"}" name="correctOption" ${option.correct ? "checked" : ""} data-option-correct="${option.id}">
            </label>
            <input type="text" value="${escapeHtml(option.text)}" placeholder="${t("question.option", { letter })}" data-option-text="${option.id}">
            <button class="small-button" type="button" data-delete-option="${option.id}">${t("actions.delete")}</button>
          </div>
        `;
      })
      .join("");

    return `
      ${optionRows}
      <button class="secondary-button" type="button" id="addOption">${t("actions.addOption")}</button>
    `;
  }

  if (question.type === "blank") {
    return `
      <label>
        <span>${t("question.acceptedAnswers")}</span>
        <textarea id="blankAnswers" rows="6">${escapeHtml((question.answers || []).join("\n"))}</textarea>
      </label>
      <label class="inline-check">
        <span>${t("question.caseSensitive")}</span>
        <input id="caseSensitive" type="checkbox" ${question.caseSensitive ? "checked" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label>
        <span>${t("question.correctAnswer")}</span>
        <select id="trueFalseAnswer">
          <option value="true" ${question.answer ? "selected" : ""}>${t("question.true")}</option>
          <option value="false" ${!question.answer ? "selected" : ""}>${t("question.false")}</option>
        </select>
      </label>
    `;
  }

  const pairRows = question.pairs
    .map((pair, index) => {
      const number = index + 1;
      return `
        <div class="pair-row" data-pair-id="${pair.id}">
          <input type="text" value="${escapeHtml(pair.left)}" placeholder="${t("question.leftItem", { number })}" data-pair-left="${pair.id}">
          <input type="text" value="${escapeHtml(pair.right)}" placeholder="${t("question.rightItem", { number })}" data-pair-right="${pair.id}">
          <button class="small-button" type="button" data-delete-pair="${pair.id}">${t("actions.delete")}</button>
        </div>
      `;
    })
    .join("");

  return `
    ${pairRows}
    <button class="secondary-button" type="button" id="addPair">${t("actions.addPair")}</button>
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

  const stats = QUESTION_TYPES.map((type) => ({
    type,
    count: paper.questions.filter((question) => question.type === type).length,
  }));
  const history = getPaperHistory(activePaperId);
  const lastHistory = history[0];
  const savedSession = loadActiveSession();
  const hasSavedSession = savedSession && savedSession.paperId === activePaperId;
  const wrongIds = getWrongQuestionIds();

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${escapeHtml(paper.title || t("paper.unnamedPaper"))}</h2>
        <p>${escapeHtml(paper.description || t("paper.ready"))}</p>
      </div>
      ${hasSavedSession ? `
        <div class="recover-box">
          <strong>${t("practice.recoverTitle")}</strong>
          <p>${t("practice.recoverBody")}</p>
          <button class="primary-button" id="resumeQuiz" type="button">${t("actions.resumeQuiz")}</button>
        </div>
      ` : ""}
      <div class="stats-grid">
        ${stats.map((item) => `
          <div class="stat-tile">
            <strong>${item.count}</strong>
            <span>${typeLabel(item.type)}</span>
          </div>
        `).join("")}
      </div>
      <div class="practice-setup">
        <h3>${t("practice.setupTitle")}</h3>
        <div class="filter-grid">
          ${QUESTION_TYPES.map((type) => `
            <label class="inline-check filter-check">
              <span>${typeShortLabel(type)}</span>
              <input type="checkbox" data-type-filter="${type}" checked>
            </label>
          `).join("")}
        </div>
        <label>
          <span>${t("practice.randomCount")}</span>
          <input id="randomCount" type="number" min="0" step="1" placeholder="0">
          <small>${t("practice.randomHint")}</small>
        </label>
      </div>
      <div class="history-panel">
        <div class="history-heading">
          <strong>${t("practice.historyTitle")}</strong>
          <button class="small-button" id="clearHistory" type="button" ${history.length ? "" : "disabled"}>${t("actions.clearHistory")}</button>
        </div>
        ${lastHistory ? `
          <p class="meta-text">${t("practice.lastScore")}: ${lastHistory.percent}% · ${formatDate(lastHistory.completedAt)} · ${t("practice.questionCount", { count: lastHistory.questionCount })}</p>
        ` : `<p class="meta-text">${t("practice.noHistory")}</p>`}
        <div class="history-list">
          ${history.slice(0, 5).map(renderHistoryItem).join("")}
        </div>
      </div>
      <div class="quiz-actions">
        <button class="primary-button" id="startQuiz" type="button" ${paper.questions.length ? "" : "disabled"}>${t("actions.startQuiz")}</button>
        <button class="secondary-button" id="startWrongQuiz" type="button" ${wrongIds.length ? "" : "disabled"}>${t("actions.startWrongQuiz")}</button>
        <button class="secondary-button" id="backToEdit" type="button">${t("actions.backToEdit")}</button>
      </div>
    </div>
  `;

  if (hasSavedSession) {
    document.getElementById("resumeQuiz").addEventListener("click", () => {
      session = savedSession;
      showToast(t("toast.sessionResumed"));
      renderCurrentQuestion();
    });
  }
  document.getElementById("startQuiz").addEventListener("click", () => startQuiz());
  document.getElementById("startWrongQuiz").addEventListener("click", () => startQuiz({ questionIds: wrongIds, wrongOnly: true }));
  document.getElementById("backToEdit").addEventListener("click", () => setMode("edit"));
  document.getElementById("clearHistory").addEventListener("click", clearPaperHistory);
  document.querySelectorAll("[data-export-response]").forEach((button) => {
    button.addEventListener("click", () => exportLearnerResponse(button.dataset.exportResponse));
  });
}

function renderHistoryItem(item) {
  return `
    <div class="history-item">
      <div class="history-summary">
        <strong>${item.percent}%</strong>
        <span>${item.correctCount}/${item.questionCount} · ${formatDate(item.completedAt)}</span>
      </div>
      ${item.responseId ? `<button class="small-button" type="button" data-export-response="${escapeHtml(item.responseId)}">${t("actions.exportResponse")}</button>` : ""}
    </div>
  `;
}

function startQuiz(options = {}) {
  const checkedTypeFilters = Array.from(document.querySelectorAll("[data-type-filter]:checked")).map((input) => input.dataset.typeFilter);
  const selectedTypes = options.questionIds
    ? QUESTION_TYPES
    : (checkedTypeFilters.length ? checkedTypeFilters : QUESTION_TYPES);
  const requestedCount = Number(document.getElementById("randomCount")?.value || 0);
  let validQuestions = paper.questions.filter(isQuestionReady);

  if (options.questionIds) {
    validQuestions = validQuestions.filter((question) => options.questionIds.includes(question.id));
  } else {
    validQuestions = validQuestions.filter((question) => selectedTypes.includes(question.type));
  }

  if (requestedCount > 0 && requestedCount < validQuestions.length) {
    validQuestions = shuffle(validQuestions).slice(0, requestedCount);
  }

  if (!validQuestions.length) {
    showToast(options.wrongOnly ? t("practice.noWrongQuestions") : t("toast.noFilteredQuestions"));
    return;
  }

  session = {
    id: makeId(),
    paperId: activePaperId,
    paperTitle: paper.title,
    startedAt: new Date().toISOString(),
    questions: validQuestions.map(prepareQuizQuestion),
    index: 0,
    answers: {},
    results: [],
    submitted: false,
    feedback: null,
    completed: false,
  };
  persistSession();
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const question = session.questions[session.index];
  const progress = Math.round((session.index / session.questions.length) * 100);
  const answeredCount = session.questions.filter((item) => isAnswerComplete(item, session.answers[item.id])).length;
  const unansweredCount = session.questions.length - answeredCount;

  quizPanel.innerHTML = `
    <div class="quiz-question">
      <div class="progress-line">
        <span>${t("question.progress", { current: session.index + 1, total: session.questions.length })}</span>
        <span>${t("practice.answered", { count: answeredCount, total: session.questions.length })} · ${t("practice.unanswered", { count: unansweredCount })}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width: ${progress}%"></div></div>
      <div class="question-prompt">
        <span class="type-pill">${typeLabel(question.type)}</span>
        <h2>${escapeHtml(question.prompt || t("question.unnamed"))}</h2>
      </div>
      ${session.feedback ? renderFeedback(session.feedback) : ""}
      <div class="answer-list">
        ${renderQuizAnswer(question)}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="quitQuiz">${t("actions.quit")}</button>
        <button class="secondary-button" type="button" id="previousQuestion" ${session.index === 0 ? "disabled" : ""}>${t("actions.previousQuestion")}</button>
        <button class="primary-button" type="button" id="${session.submitted ? "nextQuestion" : "submitAnswer"}">${session.submitted ? nextLabel() : t("actions.submitAnswer")}</button>
      </div>
    </div>
  `;

  bindQuizAnswer(question);
  document.getElementById("quitQuiz").addEventListener("click", () => {
    persistSession();
    renderQuizStart();
  });
  document.getElementById("previousQuestion").addEventListener("click", goPreviousQuestion);

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
        <span>${t("question.yourAnswer")}</span>
        <input id="blankAnswer" type="text" value="${escapeHtml(answer || "")}" ${session.submitted ? "disabled" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="true" ${answer === true ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>${t("question.true")}</span>
      </label>
      <label class="judge-line">
        <input type="radio" name="judgeAnswer" value="false" ${answer === false ? "checked" : ""} ${session.submitted ? "disabled" : ""}>
        <span>${t("question.false")}</span>
      </label>
    `;
  }

  return question.pairs
    .map((pair) => `
      <label class="match-line">
        <span>${escapeHtml(pair.left)}</span>
        <select data-match-answer="${pair.id}" ${session.submitted ? "disabled" : ""}>
          <option value="">${t("question.choose")}</option>
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
        persistSession();
        renderCurrentQuestion();
      });
    });
    return;
  }

  if (question.type === "multiple") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = Array.from(document.querySelectorAll("input[name='choiceAnswer']:checked")).map((item) => item.value);
        persistSession();
        renderCurrentQuestion();
      });
    });
    return;
  }

  if (question.type === "blank") {
    document.getElementById("blankAnswer").addEventListener("input", (event) => {
      session.answers[question.id] = event.target.value;
      persistSession();
    });
    return;
  }

  if (question.type === "truefalse") {
    document.querySelectorAll("input[name='judgeAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        session.answers[question.id] = input.value === "true";
        persistSession();
        renderCurrentQuestion();
      });
    });
    return;
  }

  document.querySelectorAll("[data-match-answer]").forEach((select) => {
    select.addEventListener("change", () => {
      session.answers[question.id] ||= {};
      session.answers[question.id][select.dataset.matchAnswer] = select.value;
      persistSession();
      renderCurrentQuestion();
    });
  });
}

function submitCurrentAnswer() {
  const question = session.questions[session.index];
  const answer = session.answers[question.id];
  if (!isAnswerComplete(question, answer)) {
    showToast(t("toast.answerRequired"));
    return;
  }

  const result = gradeQuestion(question, answer, getGradeLabels());
  session.results[session.index] = result;
  session.submitted = true;
  session.feedback = result;
  persistSession();
  renderCurrentQuestion();
}

function goPreviousQuestion() {
  if (session.index === 0) return;
  session.index -= 1;
  session.submitted = Boolean(session.results[session.index]);
  session.feedback = session.results[session.index] || null;
  persistSession();
  renderCurrentQuestion();
}

function goNextQuestion() {
  if (session.index >= session.questions.length - 1) {
    renderResults();
    return;
  }

  session.index += 1;
  session.submitted = Boolean(session.results[session.index]);
  session.feedback = session.results[session.index] || null;
  persistSession();
  renderCurrentQuestion();
}

function renderResults() {
  session.questions.forEach((question, index) => {
    if (!session.results[index]) session.results[index] = gradeQuestion(question, session.answers[question.id], getGradeLabels());
  });

  const correctCount = session.results.filter((result) => result.correct).length;
  const percent = Math.round((correctCount / session.questions.length) * 100);
  const missedQuestionIds = session.results.filter((item) => !item.correct).map((item) => item.questionId);
  session.completedAt = new Date().toISOString();
  session.correctCount = correctCount;
  session.percent = percent;
  const learnerResponse = finalizeLearnerResponse();
  if (!learnerResponse) {
    session.completed = false;
    persistSession();
    return;
  }
  session.responseId = learnerResponse.id;
  session.completed = true;
  if (!recordHistory(learnerResponse)) showToast(t("toast.historySaveFail"));
  localStorage.removeItem(ACTIVE_SESSION_KEY);

  quizPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${t("result.complete")}</h2>
        <p>${escapeHtml(paper.title || t("paper.unnamedPaper"))}</p>
      </div>
      <div class="result-score">
        <div>
          <strong>${percent}%</strong>
          <p>${t("result.score", { correct: correctCount, total: session.questions.length })}</p>
          <p class="meta-text">${t("practice.evidenceSaved")}</p>
        </div>
      </div>
      <div class="review-list">
        ${session.questions.map((question, index) => {
          const result = session.results[index];
          return `
            <div class="review-item ${result.correct ? "correct" : "wrong"}">
              <strong>${index + 1}. ${escapeHtml(question.prompt)}</strong>
              <p class="meta-text">${typeLabel(question.type)} · ${result.correct ? t("result.correct") : t("result.wrong")}</p>
              <div class="answer-compare">
                <p><strong>${t("result.yourAnswer")}:</strong> ${escapeHtml(formatAnswer(question, session.answers[question.id], getGradeLabels()) || t("result.noAnswer"))}</p>
                <p><strong>${result.correctLabel}:</strong> ${escapeHtml(result.correctAnswer)}</p>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" id="backToEditorAfterResult" type="button">${t("actions.backToEdit")}</button>
        <button class="secondary-button" id="exportResponseAfterResult" type="button">${t("actions.exportResponse")}</button>
        <button class="secondary-button" id="retryWrongAfterResult" type="button" ${missedQuestionIds.length ? "" : "disabled"}>${t("actions.startWrongQuiz")}</button>
        <button class="primary-button" id="retryQuiz" type="button">${t("actions.retry")}</button>
      </div>
    </div>
  `;

  document.getElementById("backToEditorAfterResult").addEventListener("click", () => setMode("edit"));
  document.getElementById("exportResponseAfterResult").addEventListener("click", () => exportLearnerResponse(learnerResponse.id));
  document.getElementById("retryQuiz").addEventListener("click", () => startQuiz());
  document.getElementById("retryWrongAfterResult").addEventListener("click", () => startQuiz({ questionIds: missedQuestionIds, wrongOnly: true }));
}

function renderFeedback(result) {
  return `
    <div class="feedback ${result.correct ? "correct" : "wrong"}">
      <span class="feedback-icon">${result.correct ? "✓" : "×"}</span>
      <div>
        <strong>${result.correct ? t("result.correctFeedback") : t("result.wrongFeedback")}</strong>
        <p>${escapeHtml(result.correctAnswer)}</p>
      </div>
    </div>
  `;
}

function addQuestion(type) {
  const question = createQuestion(type);
  paper.questions.push(question);
  selectedQuestionId = question.id;
  savePaper();
  renderAll();
  showToast(t("toast.added", { type: typeLabel(type) }));
}

function duplicateQuestion(id) {
  const index = paper.questions.findIndex((question) => question.id === id);
  const copy = cloneQuestion(paper.questions[index]);
  paper.questions.splice(index + 1, 0, copy);
  selectedQuestionId = copy.id;
  savePaper();
  renderAll();
  showToast(t("toast.duplicated"));
}

function deleteQuestion(id) {
  paper.questions = paper.questions.filter((question) => question.id !== id);
  selectedQuestionId = paper.questions[0]?.id ?? null;
  savePaper();
  renderAll();
  showToast(t("toast.deleted"));
}

function getSelectedQuestion() {
  return paper.questions.find((question) => question.id === selectedQuestionId) || null;
}

function saveAndRenderList() {
  savePaper();
  renderQuestionList();
}

function savePaper(options = {}) {
  const { clearSession = true } = options;
  paper.updatedAt = new Date().toISOString();
  const index = library.papers.findIndex((item) => item.id === activePaperId);
  if (index >= 0) library.papers[index] = paper;
  if (clearSession) clearActiveSession();
  saveLibrary();
}

function loadLibrary() {
  const savedLibrary = loadJson(LIBRARY_KEY);
  if (savedLibrary?.papers?.length) return normalizeAndSaveLibrary(savedLibrary);

  const legacyPaper = loadJson(LEGACY_STORAGE_KEY);
  if (legacyPaper?.questions) return normalizeAndSaveLibrary({ schemaVersion: CURRENT_SCHEMA_VERSION, papers: [legacyPaper] });

  return normalizeAndSaveLibrary({ schemaVersion: CURRENT_SCHEMA_VERSION, papers: [createDefaultPaper()] });
}

function normalizeAndSaveLibrary(value) {
  const normalized = normalizeLibrary(value, { createDefaultPaper });
  saveJson(LIBRARY_KEY, normalized);
  return normalized;
}

function loadActivePaperId() {
  const saved = localStorage.getItem(ACTIVE_PAPER_KEY);
  const id = library.papers.some((item) => item.id === saved) ? saved : library.papers[0].id;
  localStorage.setItem(ACTIVE_PAPER_KEY, id);
  return id;
}

function getActivePaper() {
  return library.papers.find((item) => item.id === activePaperId) || library.papers[0];
}

function saveLibrary() {
  saveJson(LIBRARY_KEY, library);
}

function createDefaultPaper() {
  const sample = locales[language].samplePaper;
  return {
    id: makeId(),
    title: sample.title,
    description: sample.description,
    category: t("library.defaultCategory"),
    tags: ["sample"],
    questions: [
      {
        id: makeId(),
        type: "single",
        prompt: sample.q1,
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
        prompt: sample.q2,
        options: [
          { id: makeId(), text: typeLabel("single"), correct: true },
          { id: makeId(), text: typeLabel("multiple"), correct: true },
          { id: makeId(), text: typeLabel("blank"), correct: true },
          { id: makeId(), text: sample.autoEssay, correct: false },
        ],
      },
      {
        id: makeId(),
        type: "blank",
        prompt: sample.q3,
        answers: [sample.quizMeaning1, sample.quizMeaning2],
        caseSensitive: false,
      },
      {
        id: makeId(),
        type: "truefalse",
        prompt: sample.q4,
        answer: true,
      },
      {
        id: makeId(),
        type: "matching",
        prompt: sample.q5,
        pairs: [
          { id: makeId(), left: typeLabel("truefalse"), right: sample.judgeWay },
          { id: makeId(), left: typeLabel("blank"), right: sample.blankWay },
          { id: makeId(), left: typeLabel("matching"), right: sample.matchWay },
        ],
      },
    ],
  };
}

function exportPaper() {
  downloadJson(normalizePaper(paper), `${safeFileName(paper.title || "quiz-paper")}.json`);
}

function importPaper(event) {
  const file = event.target.files[0];
  if (!file) return;

  readJsonFile(file, (imported) => {
    if (!Array.isArray(imported.questions)) throw new Error("Invalid paper");
    const nextPaper = normalizePaper({ ...imported, id: makeId(), createdAt: undefined, updatedAt: undefined, lastOpenedAt: undefined });
    library.papers.push(nextPaper);
    activePaperId = nextPaper.id;
    localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
    selectedQuestionId = nextPaper.questions[0]?.id ?? null;
    clearActiveSession();
    saveLibrary();
    renderAll();
    showToast(t("library.paperImported"));
  }, () => showToast(t("toast.importFail")));

  event.target.value = "";
}

function exportLibraryBackup() {
  try {
    const backup = createLibraryBackup({
      library,
      history: loadHistory(),
      learnerResponses: loadLearnerResponses(),
      teacherReviews: loadTeacherReviews(),
      translationLibrary: loadTranslationLibrary(),
    });
    downloadJson(backup, `quiz-studio-backup-${new Date().toISOString().slice(0, 10)}.json`);
  } catch {
    showToast(t("library.backupExportFail"));
  }
}

function importLibraryBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  readJsonFile(file, (imported) => {
    if (imported.library?.papers?.length) {
      const restored = parseLibraryBackup(imported, { createDefaultPaper });
      if (restored.hasLearnerResponses) saveJson(LEARNER_RESPONSES_KEY, restored.learnerResponses);
      if (restored.hasTeacherReviews) saveJson(TEACHER_REVIEWS_KEY, restored.teacherReviews);
      if (restored.hasTranslationLibrary) saveJson(TRANSLATION_LIBRARY_KEY, restored.translationLibrary);
      saveJson(HISTORY_KEY, restored.history);
      library = restored.library;
      activePaperId = library.papers[0].id;
      localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
      showToast(t("library.backupImported"));
    } else if (Array.isArray(imported.questions)) {
      const nextPaper = normalizePaper({ ...imported, id: makeId() });
      library.papers.push(nextPaper);
      activePaperId = nextPaper.id;
      localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
      showToast(t("library.paperImported"));
    } else {
      throw new Error("Invalid backup");
    }
    paper = getActivePaper();
    selectedQuestionId = paper.questions[0]?.id ?? null;
    clearActiveSession();
    saveLibrary();
    renderAll();
  }, () => showToast(t("library.backupImportFail")));

  event.target.value = "";
}

function readJsonFile(file, onSuccess, onError) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      onSuccess(JSON.parse(reader.result));
    } catch {
      onError();
    }
  };
  reader.onerror = onError;
  reader.readAsText(file);
}

function downloadJson(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function persistSession() {
  if (!session || session.completed) return;
  saveJson(ACTIVE_SESSION_KEY, session);
}

function finalizeLearnerResponse() {
  try {
    const response = createQuizLearnerResponse({ id: session.responseId || makeId(), session });
    const next = upsertLearnerResponse(loadLearnerResponses(), response);
    saveJson(LEARNER_RESPONSES_KEY, next);
    return response;
  } catch {
    showToast(t("toast.responseSaveFail"));
    return null;
  }
}

function loadLearnerResponses() {
  const saved = localStorage.getItem(LEARNER_RESPONSES_KEY);
  return parseLearnerResponseCollection(saved ? JSON.parse(saved) : []);
}

function loadTeacherReviews() {
  const saved = localStorage.getItem(TEACHER_REVIEWS_KEY);
  return parseTeacherReviewCollection(saved ? JSON.parse(saved) : []);
}

function loadTranslationLibrary() {
  const saved = localStorage.getItem(TRANSLATION_LIBRARY_KEY);
  return parseTranslationLibrary(saved ? JSON.parse(saved) : null);
}

function saveTranslationLibrary(next) {
  translationLibrary = next;
  saveJson(TRANSLATION_LIBRARY_KEY, translationLibrary);
}

function loadActiveTranslationSession() {
  return normalizeTranslationSession(loadJson(TRANSLATION_ACTIVE_SESSION_KEY));
}

function persistTranslationSession() {
  if (!translationSession || translationSession.completed) return;
  saveJson(TRANSLATION_ACTIVE_SESSION_KEY, translationSession);
}

function clearActiveTranslationSession() {
  removeStoredValue(TRANSLATION_ACTIVE_SESSION_KEY);
}

function renderTranslationView() {
  if (currentMode !== "translation") return;
  renderTranslationLibraryPanel();
  renderTranslationMainPanel();
}

function renderTranslationLibraryPanel() {
  translationLibraryPanel.innerHTML = `
    <div class="library-heading">
      <strong>${t("translation.title")}</strong>
      <span>${translationLibrary.documents.length}</span>
    </div>
    <div class="library-actions single-action">
      <button class="small-button" type="button" id="newTranslationFolder">${t("translation.newFolder")}</button>
    </div>
    <div class="library-list">
      ${translationLibrary.folders.length
        ? translationLibrary.folders.map(renderTranslationFolderBlock).join("")
        : `<div class="library-empty">${t("translation.emptyFolders")}</div>`}
    </div>
    <div class="translation-import">
      <div class="library-heading"><strong>${t("translation.importSection")}</strong></div>
      ${renderImportForms()}
    </div>
  `;

  document.getElementById("newTranslationFolder").addEventListener("click", createTranslationFolderPrompt);
  bindTranslationFolderEvents();
  bindImportFormEvents();
}

function renderTranslationFolderBlock(folder) {
  const docs = translationLibrary.documents.filter((doc) => doc.folderId === folder.id);
  return `
    <div class="folder-block" data-folder-id="${folder.id}">
      <div class="library-heading">
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${t("translation.documentsIn", { count: docs.length })}</span>
      </div>
      <div class="row-actions">
        <button class="small-button" type="button" data-rename-folder="${folder.id}">${t("translation.renameFolder")}</button>
        <button class="danger-button small-button" type="button" data-delete-folder="${folder.id}">${t("translation.deleteFolder")}</button>
      </div>
      <div class="library-list">
        ${docs.map(renderTranslationDocumentItem).join("")}
      </div>
      <details class="translation-create-document">
        <summary class="small-button">${t("translation.newDocument")}</summary>
        <div class="translation-form" data-new-document-form="${folder.id}">
          <label><span>${t("translation.documentTitleLabel")}</span><input type="text" data-new-document-title maxlength="120"></label>
          <label><span>${t("translation.sourceLanguage")}</span><input type="text" data-new-document-source maxlength="40"></label>
          <label><span>${t("translation.targetLanguage")}</span><input type="text" data-new-document-target maxlength="40"></label>
          <button class="primary-button small-button" type="button" data-create-document="${folder.id}">${t("translation.newDocument")}</button>
        </div>
      </details>
    </div>
  `;
}

function renderTranslationDocumentItem(doc) {
  const isActive = doc.id === selectedTranslationDocumentId;
  return `
    <button class="library-item ${isActive ? "active" : ""}" type="button" data-select-document="${doc.id}">
      <span>
        <strong>${escapeHtml(doc.title || t("library.untitled"))}</strong>
        <small>${escapeHtml(doc.sourceLanguage)} &rarr; ${escapeHtml(doc.targetLanguage)} &middot; ${t("translation.itemCount", { count: doc.items.length })}</small>
      </span>
    </button>
  `;
}

function bindTranslationFolderEvents() {
  document.querySelectorAll("[data-rename-folder]").forEach((button) => {
    button.addEventListener("click", () => renameTranslationFolderPrompt(button.dataset.renameFolder));
  });
  document.querySelectorAll("[data-delete-folder]").forEach((button) => {
    button.addEventListener("click", () => deleteTranslationFolderConfirm(button.dataset.deleteFolder));
  });
  document.querySelectorAll("[data-select-document]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTranslationDocumentId = button.dataset.selectDocument;
      translationImportDraft = null;
      translationPracticeActive = false;
      renderTranslationView();
    });
  });
  document.querySelectorAll("[data-create-document]").forEach((button) => {
    button.addEventListener("click", () => createTranslationDocumentFromForm(button.dataset.createDocument));
  });
}

function createTranslationFolderPrompt() {
  const name = window.prompt(t("translation.newFolderPrompt"), "");
  if (!name || !name.trim()) return;
  saveTranslationLibrary(createTranslationFolder(translationLibrary, { name: name.trim() }));
  renderTranslationView();
  showToast(t("toast.translationFolderCreated"));
}

function renameTranslationFolderPrompt(folderId) {
  const folder = getTranslationFolder(translationLibrary, folderId);
  const name = window.prompt(t("translation.renameFolderPrompt"), folder?.name || "");
  if (!name || !name.trim()) return;
  saveTranslationLibrary(updateTranslationFolder(translationLibrary, folderId, { name: name.trim() }));
  renderTranslationView();
  showToast(t("toast.translationFolderRenamed"));
}

function deleteTranslationFolderConfirm(folderId) {
  if (!window.confirm(t("translation.deleteFolderConfirm"))) return;
  const next = deleteTranslationFolder(translationLibrary, folderId, { cascade: true });
  if (selectedTranslationDocumentId && !next.documents.some((doc) => doc.id === selectedTranslationDocumentId)) {
    selectedTranslationDocumentId = null;
    translationPracticeActive = false;
  }
  saveTranslationLibrary(next);
  renderTranslationView();
  showToast(t("toast.translationFolderDeleted"));
}

function createTranslationDocumentFromForm(folderId) {
  const form = document.querySelector(`[data-new-document-form="${folderId}"]`);
  const title = form.querySelector("[data-new-document-title]").value.trim();
  const sourceLanguage = form.querySelector("[data-new-document-source]").value.trim();
  const targetLanguage = form.querySelector("[data-new-document-target]").value.trim();
  if (!title || !sourceLanguage || !targetLanguage) {
    showToast(t("toast.translationDocumentFieldsRequired"));
    return;
  }
  const next = createTranslationDocument(translationLibrary, { title, folderId, sourceLanguage, targetLanguage, items: [] });
  selectedTranslationDocumentId = next.documents[next.documents.length - 1].id;
  translationImportDraft = null;
  translationPracticeActive = false;
  saveTranslationLibrary(next);
  renderTranslationView();
  showToast(t("toast.translationDocumentCreated"));
}

function renderImportForms() {
  const folderOptions = translationLibrary.folders
    .map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`)
    .join("");
  const disabled = translationLibrary.folders.length ? "" : "disabled";
  const hint = translationLibrary.folders.length ? "" : `<p class="meta-text">${t("translation.importNeedFolder")}</p>`;

  return `
    ${hint}
    <details class="translation-import-form">
      <summary class="small-button">${t("translation.importSourceOnly")}</summary>
      <div class="translation-form">
        <p class="meta-text">${t("translation.importSourceOnlyHint")}</p>
        <label><span>${t("translation.documentTitleLabel")}</span><input type="text" id="sourceOnlyTitle" maxlength="120" ${disabled}></label>
        <label><span>${t("translation.importTargetFolder")}</span><select id="sourceOnlyFolder" ${disabled}>${folderOptions}</select></label>
        <label><span>${t("translation.sourceLanguage")}</span><input type="text" id="sourceOnlySourceLang" maxlength="40" ${disabled}></label>
        <label><span>${t("translation.targetLanguage")}</span><input type="text" id="sourceOnlyTargetLang" maxlength="40" ${disabled}></label>
        <label><span>${t("translation.importTextLabel")}</span><textarea id="sourceOnlyText" rows="6" ${disabled}></textarea></label>
        <button class="secondary-button" type="button" id="previewSourceOnlyImport" ${disabled}>${t("translation.importPreviewButton")}</button>
      </div>
    </details>
    <details class="translation-import-form">
      <summary class="small-button">${t("translation.importBilingual")}</summary>
      <div class="translation-form">
        <p class="meta-text">${t("translation.importBilingualHint")}</p>
        <label><span>${t("translation.documentTitleLabel")}</span><input type="text" id="bilingualTitle" maxlength="120" ${disabled}></label>
        <label><span>${t("translation.importTargetFolder")}</span><select id="bilingualFolder" ${disabled}>${folderOptions}</select></label>
        <label><span>${t("translation.sourceLanguage")}</span><input type="text" id="bilingualSourceLang" maxlength="40" ${disabled}></label>
        <label><span>${t("translation.targetLanguage")}</span><input type="text" id="bilingualTargetLang" maxlength="40" ${disabled}></label>
        <label><span>${t("translation.importTextLabel")}</span><textarea id="bilingualText" rows="6" ${disabled}></textarea></label>
        <button class="secondary-button" type="button" id="previewBilingualImport" ${disabled}>${t("translation.importPreviewButton")}</button>
      </div>
    </details>
    <details class="translation-import-form">
      <summary class="small-button">${t("translation.importJson")}</summary>
      <div class="translation-form">
        <label><span>${t("translation.importTargetFolder")}</span><select id="jsonImportFolder" ${disabled}>${folderOptions}</select></label>
        <label class="secondary-button file-label">
          <span>${t("actions.import")}</span>
          <input type="file" id="jsonImportFile" accept="application/json,.json" ${disabled}>
        </label>
      </div>
    </details>
  `;
}

function bindImportFormEvents() {
  const previewSourceOnly = document.getElementById("previewSourceOnlyImport");
  if (previewSourceOnly) {
    previewSourceOnly.addEventListener("click", () => {
      const title = document.getElementById("sourceOnlyTitle").value.trim();
      const folderId = document.getElementById("sourceOnlyFolder").value;
      const sourceLanguage = document.getElementById("sourceOnlySourceLang").value.trim();
      const targetLanguage = document.getElementById("sourceOnlyTargetLang").value.trim();
      const { items, errors } = parseSourceOnlyText(document.getElementById("sourceOnlyText").value);
      translationImportDraft = {
        kind: "source-only",
        title,
        folderId,
        sourceLanguage,
        targetLanguage,
        items,
        errors: [...errors, ...validateDraftMetadata({ title, sourceLanguage, targetLanguage })],
        allowCopy: false,
      };
      selectedTranslationDocumentId = null;
      translationPracticeActive = false;
      renderTranslationMainPanel();
    });
  }

  const previewBilingual = document.getElementById("previewBilingualImport");
  if (previewBilingual) {
    previewBilingual.addEventListener("click", () => {
      const title = document.getElementById("bilingualTitle").value.trim();
      const folderId = document.getElementById("bilingualFolder").value;
      const sourceLanguage = document.getElementById("bilingualSourceLang").value.trim();
      const targetLanguage = document.getElementById("bilingualTargetLang").value.trim();
      const { items, errors } = parseBilingualText(document.getElementById("bilingualText").value);
      translationImportDraft = {
        kind: "bilingual",
        title,
        folderId,
        sourceLanguage,
        targetLanguage,
        items,
        errors: [...errors, ...validateDraftMetadata({ title, sourceLanguage, targetLanguage })],
        allowCopy: false,
      };
      selectedTranslationDocumentId = null;
      translationPracticeActive = false;
      renderTranslationMainPanel();
    });
  }

  const jsonFileInput = document.getElementById("jsonImportFile");
  if (jsonFileInput) {
    jsonFileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const folderId = document.getElementById("jsonImportFolder").value;
      const reader = new FileReader();
      reader.onload = () => {
        const { document: parsedDocument, errors } = parseTranslationDocumentJsonText(reader.result);
        translationImportDraft = {
          kind: "json",
          folderId,
          document: parsedDocument,
          errors,
          allowCopy: false,
        };
        selectedTranslationDocumentId = null;
        translationPracticeActive = false;
        renderTranslationMainPanel();
      };
      reader.onerror = () => showToast(t("toast.translationImportFail"));
      reader.readAsText(file);
      event.target.value = "";
    });
  }
}

function validateDraftMetadata({ title, sourceLanguage, targetLanguage }) {
  const errors = [];
  if (!title) errors.push(t("translation.importTitleRequired"));
  if (!sourceLanguage) errors.push(t("translation.importSourceLanguageRequired"));
  if (!targetLanguage) errors.push(t("translation.importTargetLanguageRequired"));
  return errors;
}

function renderTranslationMainPanel() {
  if (correctionWorkspaceResponseId) {
    renderCorrectionWorkspace(correctionWorkspaceResponseId);
    return;
  }
  if (translationPracticeActive && translationSession) {
    if (translationSession.completed) {
      renderTranslationPracticeComplete();
    } else {
      renderTranslationPracticeScreen();
    }
    return;
  }
  if (translationImportDraft) {
    renderImportPreviewPanel();
    return;
  }
  const doc = translationLibrary.documents.find((item) => item.id === selectedTranslationDocumentId);
  if (!doc) {
    translationDocumentPanel.innerHTML = `<div class="empty-state"><div>${t("translation.selectDocument")}</div></div>`;
    return;
  }
  renderTranslationDocumentEditor(doc);
}

function renderTranslationDocumentEditor(doc) {
  const hasRecoverableSession = isTranslationSessionForDocument(translationSession, doc.id);
  const finalizedResponses = loadLearnerResponses().filter((response) => response.material.id === doc.id);

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${escapeHtml(doc.sourceLanguage)} &rarr; ${escapeHtml(doc.targetLanguage)}</span>
        <div class="row-actions">
          <button class="small-button" type="button" id="exportTranslationDocument">${t("translation.exportDocument")}</button>
          <button class="danger-button small-button" type="button" id="deleteTranslationDocument">${t("translation.deleteDocument")}</button>
        </div>
      </div>
      ${hasRecoverableSession ? `
        <div class="recover-box">
          <strong>${t("translationPractice.recoverTitle")}</strong>
          <p>${t("translationPractice.recoverBody")}</p>
          <div class="quiz-actions">
            <button class="primary-button" type="button" id="resumeTranslationPractice">${t("translationPractice.resume")}</button>
            <button class="danger-button secondary-button" type="button" id="discardTranslationPractice">${t("translationPractice.discard")}</button>
          </div>
        </div>
      ` : `
        <button class="primary-button" type="button" id="startTranslationPractice" ${doc.items.length ? "" : "disabled"}>${t("translationPractice.start")}</button>
      `}
      <div class="field-grid">
        <label><span>${t("translation.documentTitleLabel")}</span><input id="translationDocTitle" type="text" maxlength="120" value="${escapeHtml(doc.title)}"></label>
        <label><span>${t("translation.moveDocument")}</span>
          <select id="translationDocFolder">
            ${translationLibrary.folders.map((folder) => `<option value="${folder.id}" ${folder.id === doc.folderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="field-grid">
        <label><span>${t("translation.sourceLanguage")}</span><input id="translationDocSourceLang" type="text" maxlength="40" value="${escapeHtml(doc.sourceLanguage)}"></label>
        <label><span>${t("translation.targetLanguage")}</span><input id="translationDocTargetLang" type="text" maxlength="40" value="${escapeHtml(doc.targetLanguage)}"></label>
      </div>
      <div class="question-list-header">
        <strong>${t("translation.items")}</strong>
        <span>${doc.items.length}</span>
      </div>
      <div class="translation-item-list" id="translationItemList">
        ${doc.items.length
          ? doc.items.map((item, index) => renderTranslationItemRow(item, index, doc.items.length)).join("")
          : `<div class="library-empty">${t("translation.emptyItems")}</div>`}
      </div>
      <button class="secondary-button" type="button" id="addTranslationItem">${t("translation.addItem")}</button>
      ${finalizedResponses.length ? `
        <div class="question-list-header">
          <strong>${t("review.finalizedResponses")}</strong>
          <span>${finalizedResponses.length}</span>
        </div>
        <div class="review-list">
          ${finalizedResponses.map((response) => `
            <div class="review-item">
              <span class="meta-text">${escapeHtml(new Date(response.finalizedAt || response.session.completedAt || Date.now()).toLocaleString())}</span>
              <div class="row-actions">
                <button class="small-button" type="button" data-open-review="${response.id}">${t("review.openWorkspace")}</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;

  bindTranslationDocumentEditorEvents(doc);
}

function renderTranslationItemRow(item, index, total) {
  return `
    <div class="translation-item-row" data-item-id="${item.id}">
      <div class="item-index">${index + 1}</div>
      <div class="item-fields">
        <label><span>${t("translation.sourceText")}</span><textarea rows="2" data-item-source="${item.id}">${escapeHtml(item.sourceText)}</textarea></label>
        <label><span>${t("translation.referenceTranslation")}</span><input type="text" data-item-reference="${item.id}" value="${escapeHtml(item.referenceTranslation || "")}"></label>
        <label><span>${t("translation.notes")}</span><input type="text" data-item-notes="${item.id}" value="${escapeHtml(item.notes || "")}"></label>
      </div>
      <div class="item-actions">
        <button class="small-button" type="button" data-item-up="${item.id}" ${index === 0 ? "disabled" : ""}>&uarr;</button>
        <button class="small-button" type="button" data-item-down="${item.id}" ${index === total - 1 ? "disabled" : ""}>&darr;</button>
        <button class="danger-button small-button" type="button" data-item-delete="${item.id}">${t("actions.delete")}</button>
      </div>
    </div>
  `;
}

function bindTranslationDocumentEditorEvents(doc) {
  document.getElementById("startTranslationPractice")?.addEventListener("click", () => startTranslationPractice(doc.id));
  document.getElementById("resumeTranslationPractice")?.addEventListener("click", () => {
    translationPracticeActive = true;
    renderTranslationMainPanel();
  });
  document.getElementById("discardTranslationPractice")?.addEventListener("click", discardTranslationPractice);
  document.getElementById("translationDocTitle").addEventListener("input", (event) => {
    updateSelectedTranslationDocument({ title: event.target.value });
  });
  document.getElementById("translationDocFolder").addEventListener("change", (event) => {
    updateSelectedTranslationDocument({ folderId: event.target.value });
  });
  document.getElementById("translationDocSourceLang").addEventListener("input", (event) => {
    updateSelectedTranslationDocument({ sourceLanguage: event.target.value });
  });
  document.getElementById("translationDocTargetLang").addEventListener("input", (event) => {
    updateSelectedTranslationDocument({ targetLanguage: event.target.value });
  });
  document.getElementById("exportTranslationDocument").addEventListener("click", () => exportTranslationDocument(doc.id));
  document.getElementById("deleteTranslationDocument").addEventListener("click", () => deleteTranslationDocumentConfirm(doc.id));
  document.getElementById("addTranslationItem").addEventListener("click", () => addTranslationItemToDocument(doc.id));
  document.querySelectorAll("[data-open-review]").forEach((button) => {
    button.addEventListener("click", () => openCorrectionWorkspace(button.dataset.openReview));
  });

  document.querySelectorAll("[data-item-source]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      updateTranslationItemField(doc.id, textarea.dataset.itemSource, { sourceText: event.target.value });
    });
  });
  document.querySelectorAll("[data-item-reference]").forEach((input) => {
    input.addEventListener("input", (event) => {
      updateTranslationItemField(doc.id, input.dataset.itemReference, { referenceTranslation: event.target.value });
    });
  });
  document.querySelectorAll("[data-item-notes]").forEach((input) => {
    input.addEventListener("input", (event) => {
      updateTranslationItemField(doc.id, input.dataset.itemNotes, { notes: event.target.value });
    });
  });
  document.querySelectorAll("[data-item-up]").forEach((button) => {
    button.addEventListener("click", () => moveTranslationItem(doc.id, button.dataset.itemUp, -1));
  });
  document.querySelectorAll("[data-item-down]").forEach((button) => {
    button.addEventListener("click", () => moveTranslationItem(doc.id, button.dataset.itemDown, 1));
  });
  document.querySelectorAll("[data-item-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteTranslationItem(doc.id, button.dataset.itemDelete));
  });
}

function startTranslationPractice(documentId) {
  const doc = translationLibrary.documents.find((item) => item.id === documentId);
  if (!doc || !doc.items.length) return;
  if (translationSession && !translationSession.completed && translationSession.documentId !== doc.id) {
    if (!window.confirm(t("translationPractice.overwriteConfirm"))) return;
  }
  translationSession = createTranslationSession({ document: doc });
  translationPracticeActive = true;
  persistTranslationSession();
  renderTranslationMainPanel();
}

function discardTranslationPractice() {
  if (!window.confirm(t("translationPractice.discardConfirm"))) return;
  translationSession = null;
  translationPracticeActive = false;
  clearActiveTranslationSession();
  renderTranslationMainPanel();
  showToast(t("toast.translationPracticeDiscarded"));
}

function exitTranslationPractice() {
  persistTranslationSession();
  translationPracticeActive = false;
  renderTranslationMainPanel();
}

function renderTranslationPracticeScreen() {
  const activeSession = translationSession;
  const item = activeSession.items[activeSession.index];
  const total = activeSession.items.length;
  const answeredCount = activeSession.items.filter((entry) => (activeSession.answers[entry.id] || "").trim()).length;
  const revealed = Boolean(activeSession.revealed[item.id]);
  const progress = Math.round((activeSession.index / Math.max(total - 1, 1)) * 100);

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${escapeHtml(activeSession.sourceLanguage)} &rarr; ${escapeHtml(activeSession.targetLanguage)}</span>
        <div class="row-actions">
          <button class="secondary-button small-button" type="button" id="exitTranslationPractice">${t("translationPractice.exit")}</button>
        </div>
      </div>
      <div class="quiz-title-block">
        <h2>${escapeHtml(activeSession.documentTitle || t("library.untitled"))}</h2>
      </div>
      <div class="progress-line">
        <span>${t("translationPractice.progress", { current: activeSession.index + 1, total })}</span>
        <span>${t("translationPractice.answered", { count: answeredCount, total })}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" style="width: ${progress}%"></div></div>
      <div class="question-prompt">
        <span class="type-pill">${t("translationPractice.sourceLabel")}</span>
        <p class="translation-source-text">${escapeHtml(item.sourceText)}</p>
      </div>
      ${item.referenceTranslation ? renderReferenceBlock(item, revealed) : ""}
      <label>
        <span>${t("translationPractice.yourTranslation")}</span>
        <textarea id="translationAnswerEditor" rows="6">${escapeHtml(activeSession.answers[item.id] || "")}</textarea>
      </label>
      <div id="annotationSection">${renderAnnotationSectionHtml(item.id)}</div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="previousTranslationItem" ${activeSession.index === 0 ? "disabled" : ""}>${t("actions.previousQuestion")}</button>
        <button class="secondary-button" type="button" id="nextTranslationItem" ${activeSession.index === total - 1 ? "disabled" : ""}>${t("actions.nextQuestion")}</button>
        <button class="primary-button" type="button" id="finishTranslationPractice">${t("translationPractice.finish")}</button>
      </div>
    </div>
  `;

  document.getElementById("exitTranslationPractice").addEventListener("click", exitTranslationPractice);
  bindAnnotationSectionEvents(item.id);
  document.getElementById("translationAnswerEditor").addEventListener("input", (event) => {
    const beforeCount = (translationSession.annotations[item.id] || []).length;
    translationSession = setTranslationAnswer(translationSession, item.id, event.target.value);
    persistTranslationSession();
    const afterCount = (translationSession.annotations[item.id] || []).length;
    if (afterCount < beforeCount) {
      showToast(t("toast.translationAnnotationsInvalidated"));
      document.getElementById("annotationSection").innerHTML = renderAnnotationSectionHtml(item.id);
      bindAnnotationSectionEvents(item.id);
    }
  });
  document.getElementById("previousTranslationItem").addEventListener("click", () => {
    translationSession = goToTranslationIndex(translationSession, translationSession.index - 1);
    persistTranslationSession();
    renderTranslationMainPanel();
  });
  document.getElementById("nextTranslationItem").addEventListener("click", () => {
    translationSession = goToTranslationIndex(translationSession, translationSession.index + 1);
    persistTranslationSession();
    renderTranslationMainPanel();
  });
  document.getElementById("finishTranslationPractice").addEventListener("click", finishTranslationPractice);

  document.getElementById("revealTranslationReference")?.addEventListener("click", () => {
    translationSession = setTranslationRevealed(translationSession, item.id, !revealed);
    persistTranslationSession();
    renderTranslationMainPanel();
  });
}

function renderReferenceBlock(item, revealed) {
  if (!revealed) {
    return `
      <div class="reference-block">
        <button class="small-button" type="button" id="revealTranslationReference">${t("translationPractice.revealReference")}</button>
      </div>
    `;
  }
  return `
    <div class="reference-block revealed">
      <span class="meta-text">${t("translationPractice.referenceLabel")}</span>
      <p>${escapeHtml(item.referenceTranslation)}</p>
      <button class="small-button" type="button" id="revealTranslationReference">${t("translationPractice.hideReference")}</button>
    </div>
  `;
}

function renderAnnotationSectionHtml(itemId) {
  const annotations = translationSession.annotations[itemId] || [];
  return `
    <div class="annotation-toolbar">
      <span class="meta-text">${t("translationPractice.markSelectionAs")}</span>
      <button type="button" class="small-button" data-mark-kind="unknown">${t("translationPractice.kind.unknown")}</button>
      <button type="button" class="small-button" data-mark-kind="uncertain">${t("translationPractice.kind.uncertain")}</button>
      <button type="button" class="small-button" data-mark-kind="should_know">${t("translationPractice.kind.should_know")}</button>
    </div>
    <div class="annotation-list">
      ${annotations.length ? annotations.map(renderAnnotationRow).join("") : `<p class="meta-text">${t("translationPractice.noAnnotations")}</p>`}
    </div>
  `;
}

function renderAnnotationRow(annotation) {
  return `
    <div class="annotation-row" data-annotation-id="${annotation.id}">
      <span class="annotation-kind-pill annotation-kind-${annotation.kind}">${t(`translationPractice.kind.${annotation.kind}`)}</span>
      <span class="annotation-text">&ldquo;${escapeHtml(annotation.text)}&rdquo;</span>
      <div class="row-actions">
        <select data-change-annotation-kind="${annotation.id}" aria-label="${t("translationPractice.markSelectionAs")}">
          <option value="unknown" ${annotation.kind === "unknown" ? "selected" : ""}>${t("translationPractice.kind.unknown")}</option>
          <option value="uncertain" ${annotation.kind === "uncertain" ? "selected" : ""}>${t("translationPractice.kind.uncertain")}</option>
          <option value="should_know" ${annotation.kind === "should_know" ? "selected" : ""}>${t("translationPractice.kind.should_know")}</option>
        </select>
        <button type="button" class="danger-button small-button" data-remove-annotation="${annotation.id}">${t("actions.delete")}</button>
      </div>
    </div>
  `;
}

function renderAnnotationRowReadOnly(annotation) {
  return `
    <div class="annotation-row">
      <span class="annotation-kind-pill annotation-kind-${annotation.kind}">${t(`translationPractice.kind.${annotation.kind}`)}</span>
      <span class="annotation-text">&ldquo;${escapeHtml(annotation.text)}&rdquo;</span>
    </div>
  `;
}

function bindAnnotationSectionEvents(itemId) {
  document.querySelectorAll("[data-mark-kind]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => markTranslationSelection(itemId, button.dataset.markKind));
  });
  document.querySelectorAll("[data-change-annotation-kind]").forEach((select) => {
    select.addEventListener("change", (event) => {
      translationSession = changeTranslationAnnotationKind(translationSession, itemId, select.dataset.changeAnnotationKind, event.target.value);
      persistTranslationSession();
      refreshAnnotationSection(itemId);
    });
  });
  document.querySelectorAll("[data-remove-annotation]").forEach((button) => {
    button.addEventListener("click", () => {
      translationSession = removeTranslationAnnotation(translationSession, itemId, button.dataset.removeAnnotation);
      persistTranslationSession();
      refreshAnnotationSection(itemId);
    });
  });
}

function refreshAnnotationSection(itemId) {
  const section = document.getElementById("annotationSection");
  if (!section) return;
  section.innerHTML = renderAnnotationSectionHtml(itemId);
  bindAnnotationSectionEvents(itemId);
}

function markTranslationSelection(itemId, kind) {
  const textarea = document.getElementById("translationAnswerEditor");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.translationAnnotationSelectionRequired"));
    return;
  }
  const text = textarea.value.slice(start, end);
  try {
    translationSession = addTranslationAnnotation(translationSession, itemId, { kind, start, end, text });
    persistTranslationSession();
    refreshAnnotationSection(itemId);
  } catch {
    showToast(t("toast.translationAnnotationOverlap"));
  }
}

function finishTranslationPractice() {
  const completedAt = new Date().toISOString();
  const finalized = { ...translationSession, completed: true, completedAt };
  let response;
  try {
    response = createTranslationLearnerResponse({ id: translationSession.responseId || makeId(), session: finalized });
    const nextResponses = upsertLearnerResponse(loadLearnerResponses(), response);
    saveJson(LEARNER_RESPONSES_KEY, nextResponses);
  } catch {
    showToast(t("toast.translationResponseSaveFail"));
    return;
  }

  clearActiveTranslationSession();
  translationLastResponseId = response.id;
  translationSession = { ...finalized, responseId: response.id };
  renderTranslationMainPanel();
  showToast(t("toast.translationPracticeSaved"));
}

function renderTranslationPracticeComplete() {
  const completedSession = translationSession;
  translationDocumentPanel.innerHTML = `
    <div class="quiz-start">
      <div class="quiz-title-block">
        <h2>${t("translationPractice.completeTitle")}</h2>
        <p>${escapeHtml(completedSession.documentTitle || t("library.untitled"))}</p>
      </div>
      <p class="meta-text">${t("translationPractice.completeSummary", { count: completedSession.items.length })}</p>
      <p class="meta-text">${t("practice.evidenceSaved")}</p>
      <div class="review-list">
        ${completedSession.items.map((item) => `
          <div class="review-item">
            <strong>${escapeHtml(item.sourceText)}</strong>
            <div class="answer-compare">
              <p><strong>${t("translationPractice.yourTranslation")}:</strong> ${escapeHtml(completedSession.answers[item.id] || t("result.noAnswer"))}</p>
              ${item.referenceTranslation ? `<p><strong>${t("translationPractice.referenceLabel")}:</strong> ${escapeHtml(item.referenceTranslation)}</p>` : ""}
            </div>
            ${(completedSession.annotations[item.id] || []).length ? `
              <div class="annotation-list">
                ${completedSession.annotations[item.id].map(renderAnnotationRowReadOnly).join("")}
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" id="backToDocumentAfterPractice" type="button">${t("translationPractice.backToDocument")}</button>
        <button class="secondary-button" id="exportTranslationResponseAfterPractice" type="button">${t("actions.exportResponse")}</button>
        <button class="secondary-button" id="openCorrectionWorkspaceAfterPractice" type="button">${t("review.openWorkspace")}</button>
        <button class="primary-button" id="retryTranslationPractice" type="button">${t("translationPractice.practiceAgain")}</button>
      </div>
    </div>
  `;

  document.getElementById("backToDocumentAfterPractice").addEventListener("click", () => {
    translationPracticeActive = false;
    translationSession = null;
    renderTranslationView();
  });
  document.getElementById("exportTranslationResponseAfterPractice").addEventListener("click", () => exportLearnerResponse(translationLastResponseId));
  document.getElementById("openCorrectionWorkspaceAfterPractice").addEventListener("click", () => {
    translationPracticeActive = false;
    openCorrectionWorkspace(translationLastResponseId);
  });
  document.getElementById("retryTranslationPractice").addEventListener("click", () => {
    const docExists = translationLibrary.documents.some((item) => item.id === completedSession.documentId);
    translationSession = null;
    translationPracticeActive = false;
    if (docExists) startTranslationPractice(completedSession.documentId);
    else renderTranslationView();
  });
}

function openCorrectionWorkspace(responseId) {
  correctionWorkspaceResponseId = responseId;
  correctionReviewDraft = null;
  correctionItemIndex = 0;
  renderTranslationMainPanel();
}

function renderCorrectionWorkspace(responseId) {
  const response = findLearnerResponse(loadLearnerResponses(), responseId);
  if (!response) {
    correctionWorkspaceResponseId = null;
    correctionReviewDraft = null;
    showToast(t("toast.correctionResponseNotFound"));
    renderTranslationView();
    return;
  }

  if (!correctionReviewDraft || correctionReviewDraft.responseId !== responseId) {
    correctionReviewDraft = findTeacherReviewForResponse(loadTeacherReviews(), responseId) || normalizeTeacherReview({
      schemaVersion: 1,
      documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
      id: makeId(),
      responseId,
      createdAt: new Date().toISOString(),
      reviewer: { type: "human" },
      itemReviews: [],
      remediationRecommendations: [],
    });
    correctionItemIndex = 0;
  }

  const items = response.material.snapshot.items;
  const total = items.length;
  correctionItemIndex = Math.min(Math.max(correctionItemIndex, 0), total - 1);
  const item = items[correctionItemIndex];
  const answerEntry = response.responses.find((entry) => entry.itemId === item.id);
  const answerText = typeof answerEntry?.answer === "string" ? answerEntry.answer : "";
  const itemReview = getWorkspaceItemReview(item.id);
  const corrections = itemReview.corrections || [];
  const annotations = (response.learnerAnnotations || []).filter((annotation) => annotation.itemId === item.id);
  const segments = renderCorrectionProjection(answerText, corrections);

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${escapeHtml(response.material.snapshot.sourceLanguage || "")} &rarr; ${escapeHtml(response.material.snapshot.targetLanguage || "")}</span>
        <div class="row-actions">
          <button class="secondary-button small-button" type="button" id="exitCorrectionWorkspace">${t("review.back")}</button>
        </div>
      </div>
      <div class="quiz-title-block">
        <h2>${t("review.workspaceTitle")}</h2>
        <p>${escapeHtml(response.material.title || t("library.untitled"))}</p>
      </div>
      <div class="progress-line">
        <span>${t("translationPractice.progress", { current: correctionItemIndex + 1, total })}</span>
      </div>
      <div class="question-prompt">
        <span class="type-pill">${t("translationPractice.sourceLabel")}</span>
        <p class="translation-source-text">${escapeHtml(item.sourceText)}</p>
      </div>
      ${item.referenceTranslation ? `
        <div class="reference-block revealed">
          <span class="meta-text">${t("translationPractice.referenceLabel")}</span>
          <p>${escapeHtml(item.referenceTranslation)}</p>
        </div>
      ` : ""}
      <label>
        <span>${t("review.originalAnswer")}</span>
        <textarea id="correctionAnswerViewer" rows="6" readonly>${escapeHtml(answerText)}</textarea>
      </label>
      ${annotations.length ? `
        <span class="meta-text">${t("review.learnerMarks")}</span>
        <div class="annotation-list">
          ${annotations.map(renderAnnotationRowReadOnly).join("")}
        </div>
      ` : ""}
      <div class="correction-toolbar">
        <span class="meta-text">${t("review.applyCorrection")}</span>
        <button class="small-button" type="button" data-style="bold">${t("review.bold")}</button>
        <button class="small-button" type="button" data-style="italic">${t("review.italic")}</button>
        <button class="small-button" type="button" data-style="underline">${t("review.underline")}</button>
        <button class="small-button" type="button" data-style="strikethrough">${t("review.strikethrough")}</button>
        <button class="small-button" type="button" data-style="highlight">${t("review.highlight")}</button>
        <button class="small-button" type="button" data-style="bracket">${t("review.bracket")}</button>
        <select id="correctionColorSelect" aria-label="${t("review.textColor")}">
          ${CORRECTION_COLORS.map((color) => `<option value="${color}">${t(`review.color.${color}`)}</option>`).join("")}
        </select>
        <button class="small-button" type="button" id="applyColorCorrection">${t("review.textColor")}</button>
        <button class="small-button" type="button" id="applyInsertCorrection">${t("review.insert")}</button>
        <button class="small-button" type="button" id="applyReplaceCorrection">${t("review.replace")}</button>
        <button class="small-button" type="button" id="applyDeleteCorrection">${t("review.delete")}</button>
        <button class="small-button" type="button" id="applyCommentCorrection">${t("review.addComment")}</button>
      </div>
      <div class="correction-preview">
        <span class="meta-text">${t("review.preview")}</span>
        <p class="correction-projection">${renderProjectionHtml(segments)}</p>
      </div>
      <div class="correction-list" id="correctionList">
        ${corrections.length ? corrections.map(renderCorrectionRow).join("") : `<p class="meta-text">${t("review.noCorrections")}</p>`}
      </div>
      <div class="field-grid">
        <label><span>${t("review.judgment")}</span>
          <select id="correctionJudgment">
            <option value="">${t("review.judgmentNone")}</option>
            <option value="correct" ${itemReview.judgment === "correct" ? "selected" : ""}>${t("review.judgmentCorrect")}</option>
            <option value="incorrect" ${itemReview.judgment === "incorrect" ? "selected" : ""}>${t("review.judgmentIncorrect")}</option>
            <option value="partial" ${itemReview.judgment === "partial" ? "selected" : ""}>${t("review.judgmentPartial")}</option>
            <option value="needs-review" ${itemReview.judgment === "needs-review" ? "selected" : ""}>${t("review.judgmentNeedsReview")}</option>
          </select>
        </label>
      </div>
      <label><span>${t("review.itemComment")}</span><textarea id="correctionItemComment" rows="2">${escapeHtml(itemReview.comment || "")}</textarea></label>
      <label><span>${t("review.suggestedRevision")}</span><textarea id="correctionSuggestedRevision" rows="2">${escapeHtml(itemReview.suggestedRevision || "")}</textarea></label>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="previousCorrectionItem" ${correctionItemIndex === 0 ? "disabled" : ""}>${t("actions.previousQuestion")}</button>
        <button class="secondary-button" type="button" id="nextCorrectionItem" ${correctionItemIndex === total - 1 ? "disabled" : ""}>${t("actions.nextQuestion")}</button>
        <button class="primary-button" type="button" id="saveCorrectionReview">${t("review.save")}</button>
      </div>
    </div>
  `;

  bindCorrectionWorkspaceEvents(response, item, answerText);
}

function renderProjectionHtml(segments) {
  return segments.map((segment) => {
    if (segment.type === "deleted" || segment.type === "replaced-original") {
      return `<span class="correction-deleted">${escapeHtml(segment.text)}</span>`;
    }
    if (segment.type === "inserted") {
      const colorClass = segment.color ? ` correction-color-${segment.color}` : "";
      return `<span class="correction-inserted${colorClass}">${escapeHtml(segment.text)}</span>`;
    }
    const classes = segment.styles.map((style) => (style.styleType === "color"
      ? `correction-color-${style.color}`
      : `correction-style-${style.styleType}`));
    const title = segment.comments.length ? ` title="${escapeHtml(segment.comments.join(" | "))}"` : "";
    return `<span class="${classes.join(" ")}"${title}>${escapeHtml(segment.text)}</span>`;
  }).join("");
}

function renderCorrectionRow(correction) {
  const label = correction.operation === "style" ? t(`review.styleType.${correction.styleType}`) : t(`review.operation.${correction.operation}`);
  const detail = correction.operation === "insert" || correction.operation === "replace" || correction.operation === "comment"
    ? correction.text
    : correction.anchoredText;
  return `
    <div class="correction-row" data-correction-id="${correction.id}">
      <span class="correction-op-pill">${label}</span>
      <span class="annotation-text">&ldquo;${escapeHtml(detail)}&rdquo;</span>
      <button type="button" class="danger-button small-button" data-remove-correction="${correction.id}">${t("actions.delete")}</button>
    </div>
  `;
}

function bindCorrectionWorkspaceEvents(response, item, answerText) {
  document.getElementById("exitCorrectionWorkspace").addEventListener("click", () => {
    correctionWorkspaceResponseId = null;
    correctionReviewDraft = null;
    translationPracticeActive = false;
    renderTranslationMainPanel();
  });
  document.querySelectorAll("[data-style]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applyStyleCorrection(item.id, answerText, button.dataset.style));
  });
  const colorButton = document.getElementById("applyColorCorrection");
  colorButton.addEventListener("mousedown", (event) => event.preventDefault());
  colorButton.addEventListener("click", () => {
    applyStyleCorrection(item.id, answerText, "color", document.getElementById("correctionColorSelect").value);
  });
  ["applyInsertCorrection", "applyReplaceCorrection", "applyDeleteCorrection", "applyCommentCorrection"].forEach((id) => {
    document.getElementById(id).addEventListener("mousedown", (event) => event.preventDefault());
  });
  document.getElementById("applyInsertCorrection").addEventListener("click", () => applyInsertCorrection(item.id, answerText));
  document.getElementById("applyReplaceCorrection").addEventListener("click", () => applyReplaceCorrection(item.id, answerText));
  document.getElementById("applyDeleteCorrection").addEventListener("click", () => applyDeleteCorrection(item.id, answerText));
  document.getElementById("applyCommentCorrection").addEventListener("click", () => applyCommentCorrection(item.id, answerText));
  document.querySelectorAll("[data-remove-correction]").forEach((button) => {
    button.addEventListener("click", () => removeWorkspaceCorrection(item.id, button.dataset.removeCorrection));
  });
  document.getElementById("correctionJudgment").addEventListener("change", (event) => {
    updateWorkspaceItemReview(item.id, { judgment: event.target.value || undefined });
  });
  document.getElementById("correctionItemComment").addEventListener("input", (event) => {
    updateWorkspaceItemReview(item.id, { comment: event.target.value });
  });
  document.getElementById("correctionSuggestedRevision").addEventListener("input", (event) => {
    updateWorkspaceItemReview(item.id, { suggestedRevision: event.target.value });
  });
  document.getElementById("previousCorrectionItem").addEventListener("click", () => {
    correctionItemIndex -= 1;
    renderTranslationMainPanel();
  });
  document.getElementById("nextCorrectionItem").addEventListener("click", () => {
    correctionItemIndex += 1;
    renderTranslationMainPanel();
  });
  document.getElementById("saveCorrectionReview").addEventListener("click", () => saveCorrectionReview(response));
}

function getWorkspaceItemReview(itemId) {
  return correctionReviewDraft.itemReviews.find((entry) => entry.itemId === itemId) || { itemId };
}

function updateWorkspaceItemReview(itemId, changes) {
  const next = { ...getWorkspaceItemReview(itemId), ...changes };
  Object.keys(next).forEach((key) => {
    if (key === "itemId") return;
    if (next[key] === undefined || next[key] === "") delete next[key];
  });
  if (Array.isArray(next.corrections) && !next.corrections.length) delete next.corrections;
  const others = correctionReviewDraft.itemReviews.filter((entry) => entry.itemId !== itemId);
  correctionReviewDraft = { ...correctionReviewDraft, itemReviews: [...others, next] };
}

function applyStyleCorrection(itemId, answerText, styleType, color) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  const draft = { operation: "style", styleType, start, end, anchoredText: answerText.slice(start, end) };
  if (styleType === "color") draft.color = color;
  applyWorkspaceCorrection(itemId, answerText, draft);
}

function applyInsertCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const text = window.prompt(t("review.insertPrompt"), "");
  if (!text) return;
  applyWorkspaceCorrection(itemId, answerText, { operation: "insert", start, end: start, anchoredText: "", text });
}

function applyReplaceCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  const text = window.prompt(t("review.replacePrompt"), "");
  if (!text) return;
  applyWorkspaceCorrection(itemId, answerText, { operation: "replace", start, end, anchoredText: answerText.slice(start, end), text });
}

function applyDeleteCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  applyWorkspaceCorrection(itemId, answerText, { operation: "delete", start, end, anchoredText: answerText.slice(start, end) });
}

function applyCommentCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  const text = window.prompt(t("review.commentPrompt"), "");
  if (!text) return;
  applyWorkspaceCorrection(itemId, answerText, { operation: "comment", start, end, anchoredText: answerText.slice(start, end), text });
}

function applyWorkspaceCorrection(itemId, answerText, draft) {
  try {
    const itemReview = getWorkspaceItemReview(itemId);
    const nextCorrections = addCorrection(itemReview.corrections, draft, answerText);
    updateWorkspaceItemReview(itemId, { corrections: nextCorrections });
    renderTranslationMainPanel();
  } catch {
    showToast(t("toast.correctionConflict"));
  }
}

function removeWorkspaceCorrection(itemId, correctionId) {
  const itemReview = getWorkspaceItemReview(itemId);
  const nextCorrections = removeCorrection(itemReview.corrections, correctionId);
  updateWorkspaceItemReview(itemId, { corrections: nextCorrections });
  renderTranslationMainPanel();
}

function saveCorrectionReview(response) {
  try {
    const next = upsertTeacherReview(loadTeacherReviews(), correctionReviewDraft, { learnerResponse: response });
    saveJson(TEACHER_REVIEWS_KEY, next);
    correctionReviewDraft = findTeacherReviewForResponse(next, response.id);
    showToast(t("toast.correctionReviewSaved"));
    renderTranslationMainPanel();
  } catch {
    showToast(t("toast.correctionReviewSaveFail"));
  }
}

function updateSelectedTranslationDocument(changes) {
  try {
    const next = updateTranslationDocument(translationLibrary, selectedTranslationDocumentId, changes);
    saveTranslationLibrary(next);
    renderTranslationLibraryPanel();
  } catch {
    // Leave the field editable; the change is dropped until the document is valid again.
  }
}

function updateTranslationItemField(documentId, itemId, changes) {
  try {
    saveTranslationLibrary(updateTranslationItem(translationLibrary, documentId, itemId, changes));
  } catch {
    // Leave the field editable; the change is dropped until the item is valid again.
  }
}

function moveTranslationItem(documentId, itemId, direction) {
  const doc = translationLibrary.documents.find((item) => item.id === documentId);
  const ids = doc.items.map((item) => item.id);
  const index = ids.indexOf(itemId);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= ids.length) return;
  [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  saveTranslationLibrary(reorderTranslationItems(translationLibrary, documentId, ids));
  renderTranslationMainPanel();
}

function deleteTranslationItem(documentId, itemId) {
  saveTranslationLibrary(removeTranslationItem(translationLibrary, documentId, itemId));
  renderTranslationMainPanel();
  showToast(t("toast.translationItemDeleted"));
}

function addTranslationItemToDocument(documentId) {
  const next = addTranslationItem(translationLibrary, documentId, { sourceText: t("translation.newItemPlaceholder") });
  saveTranslationLibrary(next);
  renderTranslationMainPanel();
}

function deleteTranslationDocumentConfirm(documentId) {
  if (!window.confirm(t("translation.deleteDocumentConfirm"))) return;
  const next = deleteTranslationDocument(translationLibrary, documentId);
  if (selectedTranslationDocumentId === documentId) selectedTranslationDocumentId = null;
  if (translationSession?.documentId === documentId) translationPracticeActive = false;
  saveTranslationLibrary(next);
  renderTranslationView();
  showToast(t("toast.translationDocumentDeleted"));
}

function exportTranslationDocument(documentId) {
  const doc = getTranslationDocument(translationLibrary, documentId);
  if (!doc) return;
  downloadJson(doc, `${safeFileName(doc.title || "translation-document")}.json`);
}

function renderImportPreviewPanel() {
  const draft = translationImportDraft;
  const folder = translationLibrary.folders.find((item) => item.id === draft.folderId);
  const collision = draft.kind === "json" && draft.document ? findDocumentIdCollision(translationLibrary, draft.document.id) : false;
  const title = draft.kind === "json" ? (draft.document?.title || "") : draft.title;
  const sourceLanguage = draft.kind === "json" ? (draft.document?.sourceLanguage || "") : draft.sourceLanguage;
  const targetLanguage = draft.kind === "json" ? (draft.document?.targetLanguage || "") : draft.targetLanguage;
  const items = (draft.kind === "json" ? draft.document?.items : draft.items) || [];
  const hasReference = items.some((item) => item.referenceTranslation);
  const allErrors = [
    ...draft.errors,
    ...(folder ? [] : [t("translation.importNeedFolder")]),
    ...(collision && !draft.allowCopy ? [t("translation.importCollision")] : []),
  ];
  const canConfirm = allErrors.length === 0 && items.length > 0;

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${t("translation.importPreviewTitle")}</span>
      </div>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("translation.documentTitleLabel")}</span><strong>${escapeHtml(title || "-")}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("translation.importTargetFolder")}</span><strong>${escapeHtml(folder?.name || "-")}</strong></div>
      </div>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("translation.sourceLanguage")}</span><strong>${escapeHtml(sourceLanguage || "-")}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("translation.targetLanguage")}</span><strong>${escapeHtml(targetLanguage || "-")}</strong></div>
      </div>
      <p class="meta-text">${t("translation.itemCount", { count: items.length })} &middot; ${hasReference ? t("translation.hasReference") : t("translation.noReference")}</p>
      ${collision ? `
        <label class="inline-check">
          <span>${t("translation.importAsCopy")}</span>
          <input type="checkbox" id="importAllowCopy" ${draft.allowCopy ? "checked" : ""}>
        </label>
      ` : ""}
      ${allErrors.length ? `
        <div class="import-errors">
          <strong>${t("translation.importErrors")}</strong>
          <ul>${allErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="cancelImportPreview">${t("translation.importCancel")}</button>
        <button class="primary-button" type="button" id="confirmImportPreview" ${canConfirm ? "" : "disabled"}>${t("translation.importConfirm")}</button>
      </div>
    </div>
  `;

  document.getElementById("cancelImportPreview").addEventListener("click", () => {
    translationImportDraft = null;
    renderTranslationView();
  });
  if (collision) {
    document.getElementById("importAllowCopy").addEventListener("change", (event) => {
      translationImportDraft.allowCopy = event.target.checked;
      renderImportPreviewPanel();
    });
  }
  document.getElementById("confirmImportPreview").addEventListener("click", confirmTranslationImport);
}

function confirmTranslationImport() {
  const draft = translationImportDraft;
  try {
    let payload;
    if (draft.kind === "json") {
      const collision = findDocumentIdCollision(translationLibrary, draft.document.id);
      const nextDocument = collision ? remapDocumentForCopy(draft.document) : draft.document;
      payload = { ...nextDocument, folderId: draft.folderId };
    } else {
      payload = {
        title: draft.title,
        folderId: draft.folderId,
        sourceLanguage: draft.sourceLanguage,
        targetLanguage: draft.targetLanguage,
        items: draft.items,
      };
    }
    const next = createTranslationDocument(translationLibrary, payload);
    selectedTranslationDocumentId = next.documents[next.documents.length - 1].id;
    translationImportDraft = null;
    saveTranslationLibrary(next);
    renderTranslationView();
    showToast(t("toast.translationImportSuccess"));
  } catch {
    showToast(t("toast.translationImportFail"));
  }
}

function exportLearnerResponse(responseId) {
  try {
    const response = findLearnerResponse(loadLearnerResponses(), responseId);
    if (!response) throw new Error("Learner Response not found");
    const portable = toPortableLearnerResponse(response);
    const title = safeFileName(portable.material.title || "learner-response");
    downloadJson(portable, `${title}-response-${portable.id}.json`);
  } catch {
    showToast(t("toast.responseExportFail"));
  }
}

function loadActiveSession() {
  const saved = loadJson(ACTIVE_SESSION_KEY);
  return saved?.paperId === activePaperId && !saved.completed ? saved : null;
}

function clearActiveSession() {
  removeStoredValue(ACTIVE_SESSION_KEY);
  session = null;
}

function recordHistory(learnerResponse) {
  const history = loadHistory();
  const entry = {
    id: session.id,
    paperId: activePaperId,
    paperTitle: paper.title,
    completedAt: session.completedAt,
    questionCount: session.questions.length,
    correctCount: session.correctCount,
    percent: session.percent,
    responseId: learnerResponse.id,
    missedQuestionIds: session.results.filter((item) => !item.correct).map((item) => item.questionId),
    results: session.results,
  };
  const withoutDuplicate = history.filter((item) => item.id !== entry.id);
  withoutDuplicate.unshift(entry);
  try {
    saveJson(HISTORY_KEY, withoutDuplicate.slice(0, 100));
    return true;
  } catch {
    return false;
  }
}

function loadHistory() {
  const saved = loadJson(HISTORY_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

function getPaperHistory(paperId) {
  return loadHistory()
    .filter((item) => item.paperId === paperId)
    .sort((first, second) => new Date(second.completedAt) - new Date(first.completedAt));
}

function getWrongQuestionIds() {
  const ids = [];
  getPaperHistory(activePaperId).forEach((entry) => {
    (entry.missedQuestionIds || []).forEach((id) => {
      if (!ids.includes(id) && paper.questions.some((question) => question.id === id)) ids.push(id);
    });
  });
  return ids;
}

function clearPaperHistory() {
  if (!window.confirm(t("practice.clearHistoryConfirm"))) return;
  const kept = loadHistory().filter((item) => item.paperId !== activePaperId);
  try {
    const keptResponses = removeLearnerResponsesForMaterial(loadLearnerResponses(), activePaperId);
    saveJson(LEARNER_RESPONSES_KEY, keptResponses);
    saveJson(HISTORY_KEY, kept);
  } catch {
    showToast(t("toast.responseSaveFail"));
    return;
  }
  renderQuizStart();
  showToast(t("toast.historyCleared"));
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
}

function nextLabel() {
  return session.index >= session.questions.length - 1 ? t("actions.viewResults") : t("actions.nextQuestion");
}

function typeLabel(type) {
  return t(`types.${type}`);
}

function typeShortLabel(type) {
  return t(`shortTypes.${type}`);
}

function getGradeLabels() {
  return {
    correctAnswer: t("result.correctAnswer"),
    acceptedAnswers: t("result.acceptedAnswers"),
    correctPairs: t("result.correctPairs"),
    separator: t("result.separator"),
    pairSeparator: t("result.pairSeparator"),
    trueLabel: t("question.true"),
    falseLabel: t("question.false"),
  };
}

function t(path, params = {}) {
  const value = path.split(".").reduce((current, key) => current?.[key], locales[language]);
  const fallback = path.split(".").reduce((current, key) => current?.[key], locales.zh);
  const template = typeof value === "string" ? value : fallback;
  if (typeof template !== "string") return path;

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match;
  });
}

function loadLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  return locales[saved] ? saved : "zh";
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is optional; the app remains usable without it.
    });
  });
}
