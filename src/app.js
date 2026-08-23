import { formatAnswer, gradeQuestion } from "./core/grading.js";
import { shouldRegisterProductionServiceWorker } from "./core/service-worker-policy.js";
import { createLibraryBackup, parseLibraryBackup } from "./core/backup.js";
import {
  DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth,
  loadUiPreferences,
  saveUiPreferences,
} from "./core/ui-preferences.js";
import { studioAudio } from "./core/audio-engine.js";
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
  toPortableTeacherReview,
} from "./core/interchange.js";
import {
  findLearnerResponse,
  parseLearnerResponseCollection,
  removeLearnerResponse,
  removeLearnerResponsesForMaterial,
  upsertLearnerResponse,
} from "./core/learning-records.js";
import {
  findTeacherReviewForResponse,
  findTeacherReviewsForResponse,
  parseTeacherReviewCollection,
  removeTeacherReview,
  removeTeacherReviewsForResponse,
  upsertTeacherReview,
} from "./core/review-records.js";
import {
  classifyTeacherReviewImport,
  createRemediationRequestPackage,
  createReviewRequestPackage,
  parseExternalTeacherReviewText,
  parseRemediationTranslationDocumentText,
  validateRemediationImportProvenance,
} from "./core/review-transport.js";
import {
  analyzeLearnerResponseDeletion,
  analyzeTeacherReviewDeletion,
  analyzeTranslationDocumentDeletion,
} from "./core/deletion-policy.js";
import {
  buildHistoryIndex,
  deriveEntryStatus,
  deriveNeedsWorkItemIds,
  filterHistoryEntries,
  resolveResponseLineage,
} from "./core/translation-history.js";
import { buildRetryMaterial } from "./core/translation-retry.js";
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
  setTranslationItemMark,
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
import {
  ALL_PAPERS_CATEGORY,
  UNCATEGORIZED_CATEGORY,
  createCategory,
  deleteCategoryAndPapers,
  deleteCategoryOnly,
  filterPapersByCategory,
  getCategoryCounts,
  isReservedCategoryName,
  normalizeCategoryList,
  reassignPaperCategory,
  renameCategory,
} from "./core/categories.js";
import {
  formatFileSize,
  isSupportedAudioMime,
  isSupportedImageMime,
  normalizeAudioMetadata,
  normalizeImageMetadata,
  validateMediaFileCandidate,
} from "./core/media-types.js";
import { createDefaultMediaStore } from "./core/media-store.js";
import { cleanupOrphanedMedia, collectReferencedMediaIds, findOrphanedMediaIds } from "./core/media-references.js";
import { createPortablePaperPackage, parsePortablePaperPackage } from "./core/paper-portability.js";
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
      sound: "切换物理音效",
      settings: "偏好设置",
      language: "界面语言",
      skip: "跳到主要内容",
      close: "关闭",
      resizeSidebar: "调整侧边栏宽度",
    },
    preferences: {
      title: "偏好设置",
      soundLabel: "物理音效",
      soundHint: "开启翻页轻响、笔触摩擦与印章钝击音效",
      motionLabel: "动效偏好",
      motionStandard: "标准动效",
      motionReduced: "减弱动效",
      motionHint: "遵循系统 prefers-reduced-motion，亦可在此主动减弱纸张翻动与盖章动效",
    },
    dialog: {
      confirmTitle: "请确认",
      destructiveTitle: "确认删除",
      progressTitle: "确认放弃当前进度",
      textEntryTitle: "输入内容",
      confirm: "确认",
      delete: "删除",
      continue: "继续",
      cancel: "取消",
    },
    modes: {
      home: "首页",
      edit: "编辑",
      quiz: "做题",
      specialPractice: "专项练习",
      translation: "翻译练习",
    },
    specialPractice: {
      title: "专项练习工作台",
      tagline: "系统化专项进阶训练与开放教学交换",
      translationTitle: "双语翻译研习",
      translationDesc: "文档分段双向翻译、元认知难点标记、教师批改与独立证据链",
      enter: "进入练习",
      back: "返回专项练习",
    },
    home: {
      title: "Quiz Studio 个人研习工作台",
      tagline: "专注文档研读、深度作答与精细批改",
      quizTitle: "客观做题练习",
      quizDesc: "单选、多选、填空、判断与配对题型，支持即时反馈与答完交卷",
      specialPracticeTitle: "专项进阶练习",
      specialPracticeDesc: "双语翻译研习、词句元认知标记与独立证据链",
      editorTitle: "试卷制作与题库",
      editorDesc: "创建、管理、导入与导出本地练习试卷",
      historyTitle: "评审历史与血缘",
      historyDesc: "查看历史作答、教师评审记录与针对性重练",
      start: "开始练习",
      manage: "管理试卷",
      view: "查看历史",
    },
    category: {
      title: "分类",
      libraryTitle: "试卷库",
      allPapers: "所有试卷",
      uncategorized: "未分类",
      newCategory: "新建分类",
      newCategoryPrompt: "请输入新分类名称：",
      renameCategory: "重命名分类",
      renameCategoryPrompt: "请输入分类新名称：",
      deleteCategory: "删除分类",
      deleteCategoryTitle: "删除分类",
      deleteEmptyConfirm: "确定要删除空分类 “{name}” 吗？",
      deleteChoicePrompt: "分类 “{name}” 下包含 {count} 份试卷。请选择删除方式：",
      deleteOnlyTitle: "仅删除分类",
      deleteOnlyDesc: "保留该分类下的所有试卷并将其设为“未分类”。试卷内容、题目与作答历史均完好保存。",
      deleteWithPapersTitle: "删除分类及所有试卷",
      deleteWithPapersDesc: "永久删除该分类以及其中的全部试卷与题目。此操作无法撤销！",
      deleteOnly: "仅删除分类",
      deleteWithPapers: "删除分类及试卷 ({count} 份)",
      deleteWithPapersFinalConfirm: "【危险操作】确定要删除分类 “{name}” 及该分类下的全部 {count} 份试卷吗？此操作无法撤销！",
      backToCategories: "← 返回分类列表",
      backToPapers: "← 返回试卷列表",
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
      submitPaper: "提交试卷",
      viewResults: "查看结果",
      nextQuestion: "下一题",
      previousQuestion: "上一题",
      retry: "再做一次",
      clearHistory: "清空记录",
      exportResponse: "导出作答记录",
      cancel: "取消",
    },
    practice: {
      setupTitle: "练习设置",
      feedbackModeTitle: "答题反馈模式",
      modeInstant: "即时反馈",
      modeInstantDesc: "答完每题即时查看正误与解析",
      modeSubmitAtEnd: "答完交卷",
      modeSubmitAtEndDesc: "模拟考试流程，全部答完统一提交评分，过程中可自由切换修改答案",
      confirmSubmitAllAnswered: "确定要提交试卷吗？交卷后将完成评分并生成作答记录，无法再修改答案。",
      confirmSubmitUnanswered: "试卷中尚有 {count} 道题目未作答，确定现在提交吗？交卷后将完成评分，无法再修改答案。",
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
    media: {
      image: "图片",
      audio: "音频",
      imageSection: "题目配图",
      audioSection: "题目音频",
      uploadImage: "+ 添加图片",
      uploadAudio: "+ 添加音频",
      replaceImage: "替换图片",
      replaceAudio: "替换音频",
      removeImage: "移除图片",
      removeAudio: "移除音频",
      altTextLabel: "图片说明 / Alt（可选）：",
      altTextPlaceholder: "输入便于无障碍访问的图片文字说明...",
      zoomHint: "点击放大",
      zoomImage: "放大查看",
      imageViewerTitle: "图片查看器",
      zoomIn: "放大 (+)",
      zoomOut: "缩小 (-)",
      resetZoom: "重置 (1:1)",
      closeViewer: "关闭 (Esc)",
      unsupportedImageType: "不支持的图片格式。支持 PNG、JPEG、WebP、GIF、SVG。",
      unsupportedAudioType: "不支持的音频格式。支持 MP3、WAV、OGG、WebM、AAC、M4A、FLAC。",
      uploadFail: "媒体文件读取失败，请重试。",
    },
    question: {
      listTitle: "题目",
      emptyList: "还没有题目",
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
      deleteConfirm: "删除这道题目吗？题目内容和关联媒体将从当前试卷中移除。此操作无法撤销。",
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
      categoryCreated: "分类已创建",
      categoryRenamed: "分类已重命名",
      categoryDeleted: "分类已删除",
      categoryExists: "该分类名称已存在",
      categoryReserved: "该分类名称为系统保留字，请使用其他名称",
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
      correctionColorRequired: "请先在颜色选择器中选择一种颜色。",
      reviewRequestExportFail: "无法导出外部评阅请求。",
      reviewImportFail: "导入 Teacher Review 失败，请检查文件内容。",
      reviewImportSuccess: "Teacher Review 已导入。",
      reviewExportFail: "无法导出批改 JSON。",
      remediationRequestExportFail: "无法导出补救练习请求。",
      remediationImportFail: "导入补救练习材料失败，请检查文件内容或所选文件夹。",
      remediationImportSuccess: "补救练习材料已导入。",
      historyResponseNotFound: "未找到对应的作答记录，可能已被删除。",
      retryFail: "无法开始重新练习，请检查所选条目。",
      retryStarted: "已开始重新练习。",
      retryNeedsWorkNone: "这条记录目前没有需要加强的条目。",
      responseDeleted: "作答记录已删除。",
      reviewDeleted: "批改已删除。",
      deleteResponseBlockedByRemediation: "还有 {count} 份实时补救翻译文档引用着这条作答记录，请先删除这些补救材料，再删除这条记录。",
      deleteReviewBlockedByRemediation: "还有 {count} 份实时补救翻译文档引用着这份批改，请先删除这些补救材料，再删除这份批改。",
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
      markItemAs: "将整题标记为",
      clearMark: "清除整题标记",
      wholeQuestionMark: "整题标记",
      entireQuestionMarked: "（整题已标记）",
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
      insertPrompt: "输入要插入的文字",
      replacePrompt: "输入替换后的文字",
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
      colorDefault: "默认颜色（不设置）",
      availableReviews: "已有批改",
      openReview: "打开",
      newReview: "新建批改",
      reviewer: "评阅者",
      exportReviewRequest: "导出外部评阅请求",
      importReview: "导入 Teacher Review",
      exportReviewJson: "导出批改 JSON",
      exportRemediationRequest: "导出补救练习请求",
      importRemediationMaterial: "导入补救练习材料",
      importRemediationHint: "导入外部生成的、带补救溯源信息的翻译文档 JSON。",
      taskInstruction: "请阅读这份 Quiz Studio 外部评阅请求 JSON。返回且仅返回一个符合 Quiz Studio Teacher Review 契约（documentType 为 \"quiz-studio.teacher-review\"）的 JSON 对象。请原样保留 responseId 和各 itemId 的值，不要改写 learnerResponse。",
      remediationTaskInstruction: "请阅读这份 Quiz Studio 补救练习请求 JSON。结合学习者的作答、标记和 Teacher Review，返回且仅返回一个符合 Quiz Studio Translation Document 契约（documentType 为 \"quiz-studio.translation-document\"）的 JSON 对象，用于针对性的补救练习。provenance 必须包含 purpose: \"remediation\"、使用本请求对应取值的 sourceResponseId 和 sourceReviewId、ISO 8601 时间戳 createdAt，以及使用受支持 actor 结构的 author，例如 { \"type\": \"external-ai\", \"displayLabel\": \"Synthetic Reviewer\" }。sourceMaterialId 可选；如提供，请使用来源 Learner Response 中的材料 ID。",
      importPreviewTitle: "导入 Teacher Review 预览",
      targetResponse: "目标作答记录",
      reviewId: "Review ID",
      importStatus: "导入状态",
      importStatusNew: "新增批改",
      importStatusIdempotent: "内容相同，重复导入不会产生变化",
      importStatusUpdate: "将更新已有批改（需要确认）",
      importStatusReassignedReject: "该 Review ID 已属于另一份作答记录，已拒绝导入",
      reviewedItemCount: "已评阅 {count} 个条目",
      correctionCount: "{count} 条批改",
      remediationRecommendationCount: "{count} 条补救建议",
      reassignedRejectError: "该 Review ID 已属于另一份作答记录，不能被静默改指，已拒绝导入。",
      sourceResponse: "来源作答记录",
      sourceReview: "来源 Teacher Review",
      deleteReview: "删除批改",
      deleteReviewConfirm: "确定删除这份批改吗？此操作不会影响原始作答记录，且无法撤销。",
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
    history: {
      title: "翻译历史",
      open: "打开",
      backToList: "返回历史列表",
      empty: "还没有可浏览的翻译历史记录。",
      filterPurpose: "来源筛选",
      purposeAll: "全部",
      purposePractice: "正常练习",
      purposeRetry: "重新练习",
      purposeRemediation: "补救练习",
      filterStatus: "状态筛选",
      statusAll: "全部",
      statusUnreviewed: "未批改",
      statusReviewed: "已批改",
      statusNeedsWork: "需要加强",
      sort: "排序",
      sortNewest: "最新优先",
      sortOldest: "最早优先",
      purposeLabel: {
        practice: "正常练习",
        retry: "重新练习",
        remediation: "补救练习",
      },
      statusLabel: {
        unreviewed: "未批改",
        reviewed: "已批改",
        multipleReviews: "多份批改",
      },
      needsWorkBadge: "{count} 个条目需要加强",
      needsWorkFlag: "需要加强",
      hasRemediationBadge: "已生成补救材料",
      hasRetryBadge: "已重新练习",
      lineageTitle: "溯源链",
      derivedInto: "由此派生出的记录",
      itemsSection: "条目与作答",
      started: "开始时间",
      completed: "完成时间",
      originalMaterialUnavailable: "来源记录不可用（可能已被删除）",
      retryEntire: "整份重新练习",
      retrySelected: "选择条目重新练习",
      retryNeedsWork: "针对需要加强的条目重新练习",
      retrySelectTitle: "选择要重新练习的条目",
      retrySelectHint: "勾选需要重新练习的条目，至少选择一项。",
      retryStart: "开始重新练习",
      needsWorkConfirm: "将针对 {count} 个需要加强的条目开始新的练习，是否继续？",
      deleteResponse: "删除这条历史记录",
      deleteResponseConfirm: "确定删除这条作答记录吗？此操作无法撤销。",
      deleteResponseCascadeConfirm: "这条作答记录有 {reviewCount} 份批改、{derivedCount} 份由它派生出的记录（重新练习或补救练习）。删除它会一并删除这些批改；派生记录会保留，但将无法再找到这条来源记录。是否仍要删除？",
      deleteReviewLineageConfirm: "有 {count} 份由它派生出的记录（重新练习或补救练习）引用了这份批改。删除批改不会影响这些记录本身，但其中的来源批改信息将无法再找到。是否仍要删除？",
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
      deleteDocumentConfirmWithResponses: "这份翻译文档有 {count} 份已完成的作答记录。删除文档不会删除这些作答记录（可在“翻译历史”中继续查看），但之后无法从这份文档再次开始练习。是否仍要删除？",
      deleteItemConfirm: "删除这条翻译练习条目吗？其原文、参考译文和备注将从当前文档中移除。此操作无法撤销。",
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
      sound: "Toggle physical sound effects",
      settings: "Preferences",
      language: "Interface language",
      skip: "Skip to main content",
      close: "Close",
      resizeSidebar: "Resize sidebar",
    },
    preferences: {
      title: "Preferences",
      soundLabel: "Physical Sound Effects",
      soundHint: "Gentle page-turn rustle, pencil scratch, and stamp thuds",
      motionLabel: "Motion Preference",
      motionStandard: "Standard Motion",
      motionReduced: "Reduced Motion",
      motionHint: "Honors system preferences; also allows manually reducing paper animations",
    },
    dialog: {
      confirmTitle: "Please confirm",
      destructiveTitle: "Confirm deletion",
      progressTitle: "Discard current progress?",
      textEntryTitle: "Enter text",
      confirm: "Confirm",
      delete: "Delete",
      continue: "Continue",
      cancel: "Cancel",
    },
    modes: {
      home: "Home",
      edit: "Edit",
      quiz: "Quiz",
      specialPractice: "Special Practice",
      translation: "Translation",
    },
    specialPractice: {
      title: "Special Practice Workspace",
      tagline: "Focused specialized training and open teaching interchange",
      translationTitle: "Translation Studio",
      translationDesc: "Bilingual document translation, metacognitive marking, teacher reviews, and evidence tracking",
      enter: "Enter Practice",
      back: "Back to Special Practice",
    },
    home: {
      title: "Quiz Studio Study Workspace",
      tagline: "Focused reading, deliberate answering, and rich review",
      quizTitle: "Objective Quiz Practice",
      quizDesc: "Single, multiple, blank, true/false, and matching questions with instant feedback or exam-style submission",
      specialPracticeTitle: "Special Practice",
      specialPracticeDesc: "Bilingual translation with metacognitive marking and evidence tracking",
      editorTitle: "Quiz Authoring & Library",
      editorDesc: "Create, manage, import, and export practice papers",
      historyTitle: "Review History & Lineage",
      historyDesc: "Browse past submissions, external reviews, and retry workflows",
      start: "Start Practice",
      manage: "Manage Papers",
      view: "View History",
    },
    category: {
      title: "Categories",
      libraryTitle: "Quiz Library",
      allPapers: "All Papers",
      uncategorized: "Uncategorized",
      newCategory: "New Category",
      newCategoryPrompt: "Enter new category name:",
      renameCategory: "Rename Category",
      renameCategoryPrompt: "Enter new category name:",
      deleteCategory: "Delete Category",
      deleteCategoryTitle: "Delete Category",
      deleteEmptyConfirm: "Are you sure you want to delete the empty category '{name}'?",
      deleteChoicePrompt: "Category '{name}' contains {count} paper(s). Choose deletion option:",
      deleteOnlyTitle: "Delete Category Only",
      deleteOnlyDesc: "Keep all papers in the library and set them as 'Uncategorized'. No questions or records will be lost.",
      deleteWithPapersTitle: "Delete Category + Papers",
      deleteWithPapersDesc: "Permanently delete this category and all {count} paper(s) in it. This action cannot be undone!",
      deleteOnly: "Delete Category Only",
      deleteWithPapers: "Delete Category + Papers ({count} papers)",
      deleteWithPapersFinalConfirm: "[CAUTION] Are you sure you want to delete category '{name}' AND all {count} paper(s) in it? This action cannot be undone!",
      backToCategories: "← Back to Categories",
      backToPapers: "← Back to Papers",
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
      submitPaper: "Submit Paper",
      viewResults: "View results",
      nextQuestion: "Next question",
      previousQuestion: "Previous",
      retry: "Try again",
      clearHistory: "Clear history",
      exportResponse: "Export response",
      cancel: "Cancel",
    },
    practice: {
      setupTitle: "Practice setup",
      feedbackModeTitle: "Practice Feedback Mode",
      modeInstant: "Instant Feedback",
      modeInstantDesc: "Check correctness and feedback immediately after each question",
      modeSubmitAtEnd: "Submit at End",
      modeSubmitAtEndDesc: "Exam-style workflow; navigate and change answers freely before final submission",
      confirmSubmitAllAnswered: "Submit the paper now? Grading will be finalized and answers can no longer be changed.",
      confirmSubmitUnanswered: "You still have {count} unanswered question(s). Submit now anyway? Answers can no longer be changed after submission.",
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
    media: {
      image: "Image",
      audio: "Audio",
      imageSection: "Question Image",
      audioSection: "Question Audio",
      uploadImage: "+ Add Image",
      uploadAudio: "+ Add Audio",
      replaceImage: "Replace Image",
      replaceAudio: "Replace Audio",
      removeImage: "Remove Image",
      removeAudio: "Remove Audio",
      altTextLabel: "Alt Text / Description (optional):",
      altTextPlaceholder: "Enter accessible description of image...",
      zoomHint: "Click to zoom",
      zoomImage: "Zoom Image",
      imageViewerTitle: "Image Viewer",
      zoomIn: "Zoom In (+)",
      zoomOut: "Zoom Out (-)",
      resetZoom: "Reset (1:1)",
      closeViewer: "Close (Esc)",
      unsupportedImageType: "Unsupported image format. Supported formats: PNG, JPEG, WebP, GIF, SVG.",
      unsupportedAudioType: "Unsupported audio format. Supported formats: MP3, WAV, OGG, WebM, AAC, M4A, FLAC.",
      uploadFail: "Failed to read media file, please try again.",
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
      deleteConfirm: "Delete this question? Its content and referenced media will be removed from the current paper. This cannot be undone.",
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
      categoryCreated: "Category created",
      categoryRenamed: "Category renamed",
      categoryDeleted: "Category deleted",
      categoryExists: "Category already exists",
      categoryReserved: "This category name is reserved. Please use a different name",
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
      correctionColorRequired: "Select a color in the color picker first.",
      reviewRequestExportFail: "The review request could not be exported.",
      reviewImportFail: "The Teacher Review could not be imported. Check the file content.",
      reviewImportSuccess: "Teacher Review imported.",
      reviewExportFail: "The review JSON could not be exported.",
      remediationRequestExportFail: "The remediation request could not be exported.",
      remediationImportFail: "The remediation material could not be imported. Check the file content or the selected folder.",
      remediationImportSuccess: "Remediation material imported.",
      historyResponseNotFound: "The response could not be found. It may have been deleted.",
      retryFail: "Could not start retry practice. Check the selected items.",
      retryStarted: "Retry practice started.",
      retryNeedsWorkNone: "This response has no items that currently need work.",
      responseDeleted: "Response deleted.",
      reviewDeleted: "Review deleted.",
      deleteResponseBlockedByRemediation: "{count} live remediation Translation Document(s) still reference this response. Delete those remediation materials first, then delete this response.",
      deleteReviewBlockedByRemediation: "{count} live remediation Translation Document(s) still reference this review. Delete those remediation materials first, then delete this review.",
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
      markItemAs: "Mark entire question as",
      clearMark: "Clear whole-item mark",
      wholeQuestionMark: "Whole question",
      entireQuestionMarked: "(Whole question marked)",
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
      insertPrompt: "Enter the text to insert",
      replacePrompt: "Enter the replacement text",
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
      colorDefault: "Default color (none)",
      availableReviews: "Available reviews",
      openReview: "Open",
      newReview: "New review",
      reviewer: "Reviewer",
      exportReviewRequest: "Export for external review",
      importReview: "Import Teacher Review",
      exportReviewJson: "Export review JSON",
      exportRemediationRequest: "Export remediation request",
      importRemediationMaterial: "Import remediation material",
      importRemediationHint: "Import an externally produced Translation Document JSON that carries remediation provenance.",
      taskInstruction: "Read this Quiz Studio review-request JSON. Return exactly one JSON object conforming to the Quiz Studio Teacher Review contract (documentType \"quiz-studio.teacher-review\"). Preserve responseId and itemId values exactly. Do not rewrite the learnerResponse.",
      remediationTaskInstruction: "Read this Quiz Studio remediation-request JSON. Using the learner's answers, marks, and the teacher review, return exactly one JSON object conforming to the Quiz Studio Translation Document contract (documentType \"quiz-studio.translation-document\") for targeted follow-up practice. Its provenance must include purpose \"remediation\", sourceResponseId and sourceReviewId set to the corresponding values from this request, createdAt as an ISO 8601 timestamp, and author using a supported actor shape such as { \"type\": \"external-ai\", \"displayLabel\": \"Synthetic Reviewer\" }. sourceMaterialId is optional; if included, use the source Learner Response material ID.",
      importPreviewTitle: "Import Teacher Review Preview",
      targetResponse: "Target response",
      reviewId: "Review ID",
      importStatus: "Import status",
      importStatusNew: "New review",
      importStatusIdempotent: "Identical content; re-importing has no effect",
      importStatusUpdate: "Will update the existing review (confirmation required)",
      importStatusReassignedReject: "This review ID already belongs to a different response; import rejected",
      reviewedItemCount: "{count} items reviewed",
      correctionCount: "{count} corrections",
      remediationRecommendationCount: "{count} remediation recommendations",
      reassignedRejectError: "This review ID already belongs to a different response and cannot be silently reassigned, so the import was rejected.",
      sourceResponse: "Source response",
      sourceReview: "Source Teacher Review",
      deleteReview: "Delete review",
      deleteReviewConfirm: "Delete this review? This does not affect the original response and cannot be undone.",
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
    history: {
      title: "Translation History",
      open: "Open",
      backToList: "Back to history",
      empty: "No Translation history yet.",
      filterPurpose: "Origin",
      purposeAll: "All",
      purposePractice: "Original practice",
      purposeRetry: "Retry",
      purposeRemediation: "Remediation",
      filterStatus: "Status",
      statusAll: "All",
      statusUnreviewed: "Unreviewed",
      statusReviewed: "Reviewed",
      statusNeedsWork: "Needs work",
      sort: "Sort",
      sortNewest: "Newest first",
      sortOldest: "Oldest first",
      purposeLabel: {
        practice: "Original practice",
        retry: "Retry",
        remediation: "Remediation",
      },
      statusLabel: {
        unreviewed: "Unreviewed",
        reviewed: "Reviewed",
        multipleReviews: "Multiple reviews",
      },
      needsWorkBadge: "{count} items need work",
      needsWorkFlag: "Needs work",
      hasRemediationBadge: "Has remediation",
      hasRetryBadge: "Retried",
      lineageTitle: "Lineage",
      derivedInto: "Derived into",
      itemsSection: "Items and answers",
      started: "Started",
      completed: "Completed",
      originalMaterialUnavailable: "Source record unavailable (it may have been deleted)",
      retryEntire: "Retry entire response",
      retrySelected: "Retry selected items",
      retryNeedsWork: "Retry needs-work items",
      retrySelectTitle: "Select items to retry",
      retrySelectHint: "Check the items to retry. Select at least one.",
      retryStart: "Start retry",
      needsWorkConfirm: "This will start new practice on {count} item(s) that need work. Continue?",
      deleteResponse: "Delete this history entry",
      deleteResponseConfirm: "Delete this response? This cannot be undone.",
      deleteResponseCascadeConfirm: "This response has {reviewCount} review(s) and {derivedCount} record(s) derived from it (retry or remediation). Deleting it will also delete those reviews; derived records will remain but will no longer be able to find this source record. Delete anyway?",
      deleteReviewLineageConfirm: "{count} record(s) derived from it (retry or remediation) reference this review. Deleting the review does not affect those records themselves, but their source-review reference will no longer resolve. Delete anyway?",
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
      deleteDocumentConfirmWithResponses: "This Translation Document has {count} finalized response(s). Deleting the document does not delete those responses (they remain visible in Translation History), but you will no longer be able to start new practice from this document. Delete anyway?",
      deleteItemConfirm: "Delete this Translation Item? Its source text, reference translation, and notes will be removed from the current document. This cannot be undone.",
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
let uiPreferences = loadUiPreferences();
let currentMode = "home";
let currentFeedbackMode = "instant";
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
let reviewImportDraft = null;
let remediationImportDraft = null;
let translationHistoryOpen = false;
let translationHistoryFilters = { purpose: "all", status: "all", sort: "newest" };
let translationHistoryDetailId = null;
let retrySelectionDraft = null;
let editSidebarLevel = "questions"; // "categories" | "papers" | "questions"
let selectedCategory = ALL_PAPERS_CATEGORY;
let pendingDeleteCategoryName = null;

const homeView = document.getElementById("homeView");
const homeModeButton = document.getElementById("homeModeButton");
const homeLauncherPanel = document.getElementById("homeLauncherPanel");
const soundToggle = document.getElementById("soundToggle");
const settingsToggle = document.getElementById("settingsToggle");
const preferencesDialog = document.getElementById("preferencesDialog");
const closePreferencesDialog = document.getElementById("closePreferencesDialog");
const preferencesTitle = document.getElementById("preferencesTitle");
const prefSoundLabel = document.getElementById("prefSoundLabel");
const prefSoundCheckbox = document.getElementById("prefSoundCheckbox");
const prefSoundHint = document.getElementById("prefSoundHint");
const prefMotionLabel = document.getElementById("prefMotionLabel");
const prefMotionSelect = document.getElementById("prefMotionSelect");
const prefMotionStandard = document.getElementById("prefMotionStandard");
const prefMotionReduced = document.getElementById("prefMotionReduced");
const prefMotionHint = document.getElementById("prefMotionHint");

const categoryDeleteDialog = document.getElementById("categoryDeleteDialog");
const closeCategoryDeleteDialog = document.getElementById("closeCategoryDeleteDialog");
const categoryDeleteTitle = document.getElementById("categoryDeleteTitle");
const categoryDeleteMessage = document.getElementById("categoryDeleteMessage");
const deleteOnlyTitle = document.getElementById("deleteOnlyTitle");
const deleteOnlyDescription = document.getElementById("deleteOnlyDescription");
const deleteWithPapersTitle = document.getElementById("deleteWithPapersTitle");
const deleteWithPapersDescription = document.getElementById("deleteWithPapersDescription");
const btnDeleteCategoryOnly = document.getElementById("btnDeleteCategoryOnly");
const btnDeleteCategoryWithPapers = document.getElementById("btnDeleteCategoryWithPapers");
const btnCancelCategoryDelete = document.getElementById("btnCancelCategoryDelete");

const studyDeskDialog = document.getElementById("studyDeskDialog");
const studyDeskDialogForm = document.getElementById("studyDeskDialogForm");
const studyDeskDialogTitle = document.getElementById("studyDeskDialogTitle");
const studyDeskDialogMessage = document.getElementById("studyDeskDialogMessage");
const studyDeskDialogInputRow = document.getElementById("studyDeskDialogInputRow");
const studyDeskDialogInputLabel = document.getElementById("studyDeskDialogInputLabel");
const studyDeskDialogInput = document.getElementById("studyDeskDialogInput");
const closeStudyDeskDialog = document.getElementById("closeStudyDeskDialog");
const cancelStudyDeskDialog = document.getElementById("cancelStudyDeskDialog");
const confirmStudyDeskDialog = document.getElementById("confirmStudyDeskDialog");
let pendingStudyDeskDialog = null;

const editorView = document.getElementById("editorView");
const quizView = document.getElementById("quizView");
const specialPracticeView = document.getElementById("specialPracticeView");
const specialPracticePanel = document.getElementById("specialPracticePanel");
const specialPracticeModeButton = document.getElementById("specialPracticeModeButton");
const translationView = document.getElementById("translationView");
const translationLibraryPanel = document.getElementById("translationLibraryPanel");
const translationDocumentPanel = document.getElementById("translationDocumentPanel");
const skipLink = document.getElementById("skipLink");
const editModeButton = document.getElementById("editModeButton");
const quizModeButton = document.getElementById("quizModeButton");
const themeToggle = document.getElementById("themeToggle");
const languageSelect = document.getElementById("languageSelect");
const libraryPanel = document.getElementById("libraryPanel");
const paperQuestionSection = document.getElementById("paperQuestionSection");
const sidebarBackToPapers = document.getElementById("sidebarBackToPapers");
const sidebarPaperTitle = document.getElementById("sidebarPaperTitle");
const sidebarPaperCategoryBadge = document.getElementById("sidebarPaperCategoryBadge");
const paperTitle = document.getElementById("paperTitle");
const paperDescription = document.getElementById("paperDescription");
const paperCategorySelect = document.getElementById("paperCategorySelect");
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

const mediaStore = createDefaultMediaStore();
const mediaBlobUrlCache = new Map();

async function getOrResolveMediaUrl(assetId) {
  if (!assetId) return "";
  if (mediaBlobUrlCache.has(assetId)) {
    return mediaBlobUrlCache.get(assetId);
  }
  try {
    const asset = await mediaStore.getMediaAsset(assetId);
    if (!asset || !asset.blob) return "";
    const url = URL.createObjectURL(asset.blob);
    mediaBlobUrlCache.set(assetId, url);
    return url;
  } catch {
    return "";
  }
}

async function safeCleanupMedia(candidateAssetIds = []) {
  try {
    const deletedIds = await cleanupOrphanedMedia(mediaStore, {
      library,
      session: loadActiveSession(),
      learnerResponses: loadLearnerResponses(),
      activePaper: paper,
      candidateAssetIds,
    });
    for (const id of deletedIds) {
      if (mediaBlobUrlCache.has(id)) {
        const url = mediaBlobUrlCache.get(id);
        if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function" && url) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
        mediaBlobUrlCache.delete(id);
      }
    }
  } catch {}
}

const imageViewerDialog = document.getElementById("imageViewerDialog");
const closeImageViewerDialog = document.getElementById("closeImageViewerDialog");
const imageViewerTitle = document.getElementById("imageViewerTitle");
const imageViewerZoomLevel = document.getElementById("imageViewerZoomLevel");
const imageViewerZoomIn = document.getElementById("imageViewerZoomIn");
const imageViewerZoomOut = document.getElementById("imageViewerZoomOut");
const imageViewerResetZoom = document.getElementById("imageViewerResetZoom");
const imageViewerImg = document.getElementById("imageViewerImg");

let currentViewerZoom = 1.0;

function openImageViewer(src, alt = "") {
  if (!imageViewerDialog || !imageViewerImg) return;
  currentViewerZoom = 1.0;
  imageViewerImg.src = src;
  imageViewerImg.alt = alt || "Enlarged question image";
  imageViewerImg.style.transform = `scale(${currentViewerZoom})`;
  if (imageViewerZoomLevel) imageViewerZoomLevel.textContent = "100%";
  if (imageViewerTitle) imageViewerTitle.textContent = t("media.imageViewerTitle");
  imageViewerDialog.showModal();
}

function setViewerZoom(zoom) {
  const clamped = Math.max(0.25, Math.min(4.0, Math.round(zoom * 100) / 100));
  currentViewerZoom = clamped;
  if (imageViewerImg) imageViewerImg.style.transform = `scale(${currentViewerZoom})`;
  if (imageViewerZoomLevel) imageViewerZoomLevel.textContent = `${Math.round(currentViewerZoom * 100)}%`;
}

function restoreFocusAfterDialog(opener, fallbackSelector) {
  window.setTimeout(() => {
    const fallback = fallbackSelector ? document.querySelector(fallbackSelector) : null;
    const containingDialog = opener?.closest?.("dialog");
    const openerIsUsable = opener?.isConnected && (!containingDialog || containingDialog.open);
    const target = openerIsUsable ? opener : fallback;
    target?.focus?.();
  }, 0);
}

function focusAfterRerender(selector) {
  window.queueMicrotask(() => document.querySelector(selector)?.focus?.());
}

function settleStudyDeskDialog(confirmed) {
  if (!pendingStudyDeskDialog) return;
  const pending = pendingStudyDeskDialog;
  if (confirmed && pending.mode === "text" && pending.required && !studyDeskDialogInput.value.trim()) {
    studyDeskDialogInput.reportValidity();
    return;
  }
  const result = {
    confirmed,
    value: confirmed && pending.mode === "text" ? studyDeskDialogInput.value : null,
  };
  pendingStudyDeskDialog = null;
  studyDeskDialog.close();
  pending.resolve(result);
  restoreFocusAfterDialog(pending.opener, pending.fallbackSelector);
}

function openStudyDeskDialog({
  mode = "confirm",
  title,
  message,
  inputLabel,
  initialValue = "",
  required = false,
  confirmLabel,
  tone = "standard",
  fallbackSelector = "#mainContent",
} = {}) {
  if (pendingStudyDeskDialog) settleStudyDeskDialog(false);
  const opener = document.activeElement;
  studyDeskDialogTitle.textContent = title || t(mode === "text" ? "dialog.textEntryTitle" : "dialog.confirmTitle");
  studyDeskDialogMessage.textContent = message || "";
  const showMessage = Boolean(message) && mode !== "text";
  studyDeskDialogMessage.hidden = !showMessage;
  if (showMessage) {
    studyDeskDialog.setAttribute("aria-describedby", "studyDeskDialogMessage");
  } else {
    studyDeskDialog.removeAttribute("aria-describedby");
  }
  studyDeskDialogInputRow.hidden = mode !== "text";
  studyDeskDialogInputLabel.textContent = inputLabel || message || t("dialog.textEntryTitle");
  studyDeskDialogInput.value = mode === "text" ? initialValue : "";
  studyDeskDialogInput.required = mode === "text" && required;
  cancelStudyDeskDialog.textContent = t("dialog.cancel");
  closeStudyDeskDialog.setAttribute("aria-label", t("aria.close"));
  closeStudyDeskDialog.title = t("aria.close");
  confirmStudyDeskDialog.textContent = confirmLabel || t(tone === "danger" ? "dialog.delete" : "dialog.confirm");
  confirmStudyDeskDialog.className = tone === "danger" ? "danger-button" : "primary-button";
  studyDeskDialog.dataset.tone = tone;
  studyDeskDialog.showModal();
  window.queueMicrotask(() => {
    if (mode === "text") {
      studyDeskDialogInput.focus();
      studyDeskDialogInput.select();
    } else if (tone === "danger") {
      cancelStudyDeskDialog.focus();
    } else {
      confirmStudyDeskDialog.focus();
    }
  });
  return new Promise((resolve) => {
    pendingStudyDeskDialog = { resolve, mode, required, opener, fallbackSelector };
  });
}

async function confirmStudyDeskAction(options) {
  const result = await openStudyDeskDialog({ mode: "confirm", ...options });
  return result.confirmed;
}

async function promptStudyDeskText(options) {
  const result = await openStudyDeskDialog({ mode: "text", required: true, ...options });
  return result.confirmed ? result.value : null;
}

init();

function init() {
  uiPreferences = loadUiPreferences();
  document.documentElement.dataset.theme = uiPreferences.theme || "light";
  if (uiPreferences.motionPreference === "reduced") {
    document.documentElement.dataset.motion = "reduced";
  } else {
    delete document.documentElement.dataset.motion;
  }
  document.documentElement.style.setProperty("--sidebar-width", `${uiPreferences.sidebarWidth || 320}px`);
  studioAudio.setEnabled(uiPreferences.soundEnabled);
  document.documentElement.lang = locales[language].code;
  bindGlobalEvents();
  initSidebarResizing();
  registerServiceWorker();
  renderAll();
  setMode("home");
  updateSoundToggleUi();
}

function initSidebarResizing() {
  const root = document.documentElement;
  const initialWidth = uiPreferences.sidebarWidth || 320;
  root.style.setProperty("--sidebar-width", `${initialWidth}px`);

  const resizers = [
    document.getElementById("editorSidebarResizer"),
    document.getElementById("translationSidebarResizer"),
  ].filter(Boolean);

  resizers.forEach((resizer) => {
    let startX = 0;
    let startWidth = 0;

    const onPointerMove = (e) => {
      const currentX = e.clientX ?? e.touches?.[0]?.clientX;
      if (currentX === undefined) return;
      const deltaX = currentX - startX;
      const newWidth = clampSidebarWidth(startWidth + deltaX);
      root.style.setProperty("--sidebar-width", `${newWidth}px`);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("touchmove", onPointerMove);
      window.removeEventListener("touchend", onPointerUp);
      resizer.classList.remove("resizing");
      document.body.classList.remove("is-resizing");

      const computedWidth = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-width"), 10);
      uiPreferences.sidebarWidth = clampSidebarWidth(computedWidth);
      saveUiPreferences(uiPreferences);
    };

    const onPointerDown = (e) => {
      startX = e.clientX ?? e.touches?.[0]?.clientX;
      const currentVal = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-width"), 10);
      startWidth = Number.isFinite(currentVal) ? currentVal : DEFAULT_SIDEBAR_WIDTH;
      resizer.classList.add("resizing");
      document.body.classList.add("is-resizing");

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("touchmove", onPointerMove, { passive: true });
      window.addEventListener("touchend", onPointerUp);
    };

    resizer.addEventListener("pointerdown", onPointerDown);

    resizer.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.key === "ArrowRight" ? 20 : -20;
        const currentVal = parseInt(getComputedStyle(root).getPropertyValue("--sidebar-width"), 10);
        const newWidth = clampSidebarWidth((Number.isFinite(currentVal) ? currentVal : DEFAULT_SIDEBAR_WIDTH) + step);
        root.style.setProperty("--sidebar-width", `${newWidth}px`);
        uiPreferences.sidebarWidth = newWidth;
        saveUiPreferences(uiPreferences);
      }
    });
  });
}

function bindGlobalEvents() {
  homeModeButton.addEventListener("click", () => setMode("home"));
  editModeButton.addEventListener("click", () => setMode("edit"));
  quizModeButton.addEventListener("click", () => setMode("quiz"));
  specialPracticeModeButton?.addEventListener("click", () => setMode("specialPractice"));
  themeToggle.addEventListener("click", toggleTheme);
  soundToggle.addEventListener("click", toggleSound);
  settingsToggle?.addEventListener("click", openPreferencesDialog);
  closePreferencesDialog?.addEventListener("click", () => preferencesDialog?.close());
  preferencesDialog?.addEventListener("click", (event) => {
    if (event.target === preferencesDialog) preferencesDialog.close();
  });
  studyDeskDialogForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    settleStudyDeskDialog(true);
  });
  closeStudyDeskDialog?.addEventListener("click", () => settleStudyDeskDialog(false));
  cancelStudyDeskDialog?.addEventListener("click", () => settleStudyDeskDialog(false));
  studyDeskDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    settleStudyDeskDialog(false);
  });
  studyDeskDialog?.addEventListener("click", (event) => {
    if (event.target === studyDeskDialog) settleStudyDeskDialog(false);
  });

  prefSoundCheckbox?.addEventListener("change", () => {
    setSoundEnabled(prefSoundCheckbox.checked);
  });

  prefMotionSelect?.addEventListener("change", () => {
    const next = prefMotionSelect.value;
    uiPreferences.motionPreference = next;
    if (next === "reduced") {
      document.documentElement.dataset.motion = "reduced";
    } else {
      delete document.documentElement.dataset.motion;
    }
    saveUiPreferences(uiPreferences);
  });

  languageSelect.addEventListener("change", (event) => setLanguage(event.target.value));

  sidebarBackToPapers?.addEventListener("click", () => {
    editSidebarLevel = "papers";
    renderLibraryPanel();
  });

  paperTitle.addEventListener("input", () => {
    paper.title = paperTitle.value;
    if (sidebarPaperTitle) sidebarPaperTitle.textContent = paper.title || t("library.untitled");
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  paperDescription.addEventListener("input", () => {
    paper.description = paperDescription.value;
    savePaper({ clearSession: false });
  });

  paperCategorySelect?.addEventListener("change", async (e) => {
    if (e.target.value === "__NEW_CATEGORY__") {
      const name = await promptStudyDeskText({
        title: t("category.newCategory"),
        message: t("category.newCategoryPrompt"),
        fallbackSelector: "#paperCategorySelect",
      });
      if (name && name.trim()) {
        const trimmed = name.trim();
        if (isReservedCategoryName(trimmed)) {
          showToast(t("toast.categoryReserved"));
          renderPaperCategorySelect();
          return;
        }
        if (!library.categories.includes(trimmed)) {
          library.categories = createCategory(library.categories, trimmed);
          showToast(t("toast.categoryCreated"));
        }
        paper.category = trimmed;
        selectedCategory = trimmed;
        if (sidebarPaperCategoryBadge) sidebarPaperCategoryBadge.textContent = trimmed || t("category.uncategorized");
        savePaper({ clearSession: false });
        renderAll();
      } else {
        renderPaperCategorySelect();
      }
      return;
    }
    paper.category = e.target.value;
    if (sidebarPaperCategoryBadge) sidebarPaperCategoryBadge.textContent = paper.category || t("category.uncategorized");
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  closeCategoryDeleteDialog?.addEventListener("click", () => {
    categoryDeleteDialog?.close();
    pendingDeleteCategoryName = null;
  });
  btnCancelCategoryDelete?.addEventListener("click", () => {
    categoryDeleteDialog?.close();
    pendingDeleteCategoryName = null;
  });
  categoryDeleteDialog?.addEventListener("click", (event) => {
    if (event.target === categoryDeleteDialog) {
      categoryDeleteDialog.close();
      pendingDeleteCategoryName = null;
    }
  });
  btnDeleteCategoryOnly?.addEventListener("click", () => {
    if (!pendingDeleteCategoryName) return;
    const cat = pendingDeleteCategoryName;
    pendingDeleteCategoryName = null;
    categoryDeleteDialog?.close();
    const result = deleteCategoryOnly(library.categories, cat, library.papers);
    library.categories = result.categoryList;
    library.papers = result.papers;
    if (selectedCategory === cat) selectedCategory = ALL_PAPERS_CATEGORY;
    paper = getActivePaper();
    saveLibrary();
    renderAll();
    showToast(t("toast.categoryDeleted"));
  });
  btnDeleteCategoryWithPapers?.addEventListener("click", async () => {
    if (!pendingDeleteCategoryName) return;
    const cat = pendingDeleteCategoryName;
    const count = library.papers.filter((p) => p.category === cat).length;
    if (!await confirmStudyDeskAction({
      title: t("dialog.destructiveTitle"),
      message: t("category.deleteWithPapersFinalConfirm", { name: cat, count }),
      tone: "danger",
      fallbackSelector: "#mainContent",
    })) {
      return;
    }
    pendingDeleteCategoryName = null;
    categoryDeleteDialog?.close();
    const targetPapers = library.papers.filter((p) => p.category === cat);
    const candidateIds = targetPapers.flatMap((p) => (p.questions || []).flatMap((q) => [q.image?.id, q.audio?.id])).filter(Boolean);
    const result = deleteCategoryAndPapers(library.categories, cat, library.papers);
    library.categories = result.categoryList;
    library.papers = result.keptPapers.length ? result.keptPapers : [normalizePaper(createDefaultPaper())];
    if (result.deletedPaperIds.includes(activePaperId)) {
      activePaperId = library.papers[0].id;
      localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
      clearActiveSession();
    }
    if (selectedCategory === cat) selectedCategory = ALL_PAPERS_CATEGORY;
    paper = getActivePaper();
    selectedQuestionId = paper.questions[0]?.id ?? null;
    saveLibrary();
    renderAll();
    showToast(t("toast.categoryDeleted"));
    if (candidateIds.length) safeCleanupMedia(candidateIds);
  });

  paperTags.addEventListener("input", () => {
    paper.tags = parseTags(paperTags.value);
    savePaper({ clearSession: false });
    renderLibraryPanel();
  });

  document.querySelectorAll("[data-add-type]").forEach((button) => {
    button.addEventListener("click", () => addQuestion(button.dataset.addType));
  });

  imageViewerZoomIn?.addEventListener("click", () => setViewerZoom(currentViewerZoom + 0.25));
  imageViewerZoomOut?.addEventListener("click", () => setViewerZoom(currentViewerZoom - 0.25));
  imageViewerResetZoom?.addEventListener("click", () => setViewerZoom(1.0));
  closeImageViewerDialog?.addEventListener("click", () => imageViewerDialog?.close());
  imageViewerDialog?.addEventListener("click", (event) => {
    if (event.target === imageViewerDialog) imageViewerDialog.close();
  });

  window.addEventListener("keydown", (e) => {
    if (imageViewerDialog && imageViewerDialog.open) {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setViewerZoom(currentViewerZoom + 0.25);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setViewerZoom(currentViewerZoom - 0.25);
      } else if (e.key === "0") {
        e.preventDefault();
        setViewerZoom(1.0);
      }
    }
  });

  exportButton.addEventListener("click", exportPaper);
  importInput.addEventListener("change", importPaper);
}

function renderAll() {
  paper = getActivePaper();
  renderChrome();
  renderHomeLauncher();
  renderLibraryPanel();
  paperTitle.value = paper.title;
  paperDescription.value = paper.description;
  renderPaperCategorySelect();
  paperTags.value = (paper.tags || []).join(", ");
  renderQuestionList();
  renderQuestionEditor();
  renderQuizStart();
  renderSpecialPracticeHub();
  renderTranslationView();
}

function renderChrome() {
  document.documentElement.lang = locales[language].code;
  document.querySelector(".brand p").textContent = t("tagline");
  skipLink.textContent = t("aria.skip");
  document.querySelector(".mode-tabs").setAttribute("aria-label", t("aria.mainMode"));
  homeModeButton.textContent = t("modes.home");
  editModeButton.textContent = t("modes.edit");
  quizModeButton.textContent = t("modes.quiz");
  if (specialPracticeModeButton) specialPracticeModeButton.textContent = t("modes.specialPractice");
  themeToggle.title = t("aria.theme");
  themeToggle.setAttribute("aria-label", t("aria.theme"));
  soundToggle.title = t("aria.sound");
  soundToggle.setAttribute("aria-label", t("aria.sound"));
  if (settingsToggle) {
    settingsToggle.title = t("aria.settings");
    settingsToggle.setAttribute("aria-label", t("aria.settings"));
  }
  if (closePreferencesDialog) {
    closePreferencesDialog.setAttribute("aria-label", t("aria.close"));
    closePreferencesDialog.title = t("aria.close");
  }
  const editorResizer = document.getElementById("editorSidebarResizer");
  const translationResizer = document.getElementById("translationSidebarResizer");
  if (editorResizer) {
    editorResizer.title = t("aria.resizeSidebar");
    editorResizer.setAttribute("aria-label", t("aria.resizeSidebar"));
  }
  if (translationResizer) {
    translationResizer.title = t("aria.resizeSidebar");
    translationResizer.setAttribute("aria-label", t("aria.resizeSidebar"));
  }
  if (preferencesTitle) preferencesTitle.textContent = t("preferences.title");
  if (prefSoundLabel) prefSoundLabel.textContent = t("preferences.soundLabel");
  if (prefSoundHint) prefSoundHint.textContent = t("preferences.soundHint");
  if (prefMotionLabel) prefMotionLabel.textContent = t("preferences.motionLabel");
  if (prefMotionStandard) prefMotionStandard.textContent = t("preferences.motionStandard");
  if (prefMotionReduced) prefMotionReduced.textContent = t("preferences.motionReduced");
  if (prefMotionHint) prefMotionHint.textContent = t("preferences.motionHint");
  updateSoundToggleUi();
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

function openPreferencesDialog() {
  if (!preferencesDialog) return;
  if (prefSoundCheckbox) prefSoundCheckbox.checked = uiPreferences.soundEnabled;
  if (prefMotionSelect) prefMotionSelect.value = uiPreferences.motionPreference;
  preferencesDialog.showModal();
}

function updateSoundToggleUi() {
  if (!soundToggle) return;
  soundToggle.textContent = studioAudio.enabled ? "🔊" : "🔇";
  soundToggle.classList.toggle("active", studioAudio.enabled);
  if (prefSoundCheckbox) {
    prefSoundCheckbox.checked = studioAudio.enabled;
  }
}

function setSoundEnabled(enabled) {
  const next = Boolean(enabled);
  studioAudio.setEnabled(next);
  uiPreferences.soundEnabled = next;
  saveUiPreferences(uiPreferences);
  updateSoundToggleUi();
  if (next) {
    studioAudio.playPencilStroke();
  }
}

function toggleSound() {
  setSoundEnabled(!studioAudio.enabled);
}

function renderHomeLauncher() {
  if (currentMode !== "home" || !homeLauncherPanel) return;

  homeLauncherPanel.innerHTML = `
    <div class="launcher-header">
      <h2>${t("home.title")}</h2>
      <p>${t("home.tagline")}</p>
    </div>
    <div class="launcher-grid">
      <button type="button" class="launcher-card" id="launchQuiz">
        <div>
          <div class="launcher-card-icon">📝</div>
          <h3>${t("home.quizTitle")}</h3>
          <p>${t("home.quizDesc")}</p>
        </div>
        <div class="launcher-card-cta">${t("home.start")} &rarr;</div>
      </button>
      <button type="button" class="launcher-card" id="launchSpecialPractice">
        <div>
          <div class="launcher-card-icon">🎯</div>
          <h3>${t("home.specialPracticeTitle")}</h3>
          <p>${t("home.specialPracticeDesc")}</p>
        </div>
        <div class="launcher-card-cta">${t("home.start")} &rarr;</div>
      </button>
      <button type="button" class="launcher-card" id="launchEditor">
        <div>
          <div class="launcher-card-icon">✏️</div>
          <h3>${t("home.editorTitle")}</h3>
          <p>${t("home.editorDesc")}</p>
        </div>
        <div class="launcher-card-cta">${t("home.manage")} &rarr;</div>
      </button>
      <button type="button" class="launcher-card" id="launchHistory">
        <div>
          <div class="launcher-card-icon">📜</div>
          <h3>${t("home.historyTitle")}</h3>
          <p>${t("home.historyDesc")}</p>
        </div>
        <div class="launcher-card-cta">${t("home.view")} &rarr;</div>
      </button>
    </div>
  `;

  document.getElementById("launchQuiz")?.addEventListener("click", () => setMode("quiz"));
  document.getElementById("launchSpecialPractice")?.addEventListener("click", () => setMode("specialPractice"));
  document.getElementById("launchEditor")?.addEventListener("click", () => setMode("edit"));
  document.getElementById("launchHistory")?.addEventListener("click", () => {
    setMode("translation");
    translationHistoryOpen = true;
    renderTranslationView();
  });
}

function renderSpecialPracticeHub() {
  if (currentMode !== "specialPractice" || !specialPracticePanel) return;

  specialPracticePanel.innerHTML = `
    <div class="launcher-header">
      <h2>${t("specialPractice.title")}</h2>
      <p>${t("specialPractice.tagline")}</p>
    </div>
    <div class="launcher-grid">
      <button type="button" class="launcher-card" id="launchSpecialTranslation">
        <div>
          <div class="launcher-card-icon">📖</div>
          <h3>${t("specialPractice.translationTitle")}</h3>
          <p>${t("specialPractice.translationDesc")}</p>
        </div>
        <div class="launcher-card-cta">${t("specialPractice.enter")} &rarr;</div>
      </button>
    </div>
  `;

  document.getElementById("launchSpecialTranslation")?.addEventListener("click", () => setMode("translation"));
}

function setMode(mode) {
  currentMode = mode;
  homeView.classList.toggle("hidden", mode !== "home");
  editorView.classList.toggle("hidden", mode !== "edit");
  quizView.classList.toggle("hidden", mode !== "quiz");
  if (specialPracticeView) specialPracticeView.classList.toggle("hidden", mode !== "specialPractice");
  translationView.classList.toggle("hidden", mode !== "translation");

  homeModeButton.classList.toggle("active", mode === "home");
  editModeButton.classList.toggle("active", mode === "edit");
  quizModeButton.classList.toggle("active", mode === "quiz");
  if (specialPracticeModeButton) {
    specialPracticeModeButton.classList.toggle("active", mode === "specialPractice" || mode === "translation");
  }

  if (mode === "home") renderHomeLauncher();
  if (mode === "quiz") renderQuizStart();
  if (mode === "specialPractice") renderSpecialPracticeHub();
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

function getCategoryDisplayName(cat) {
  if (cat === ALL_PAPERS_CATEGORY) return t("category.allPapers");
  if (cat === UNCATEGORIZED_CATEGORY) return t("category.uncategorized");
  return cat;
}

function getCategoryIcon(cat) {
  if (cat === ALL_PAPERS_CATEGORY) return "📋";
  if (cat === UNCATEGORIZED_CATEGORY) return "📄";
  return "📁";
}

function renderLibraryPanel() {
  const counts = getCategoryCounts(library.categories, library.papers);

  if (
    selectedCategory !== ALL_PAPERS_CATEGORY &&
    selectedCategory !== UNCATEGORIZED_CATEGORY &&
    !library.categories.includes(selectedCategory)
  ) {
    selectedCategory = ALL_PAPERS_CATEGORY;
  }

  // Manage progressive visibility between Levels 1 & 2 (libraryPanel) and Level 3 (paperQuestionSection)
  if (editSidebarLevel === "questions") {
    libraryPanel.classList.add("hidden");
    paperQuestionSection?.classList.remove("hidden");
    if (sidebarPaperTitle) sidebarPaperTitle.textContent = paper.title || t("library.untitled");
    if (sidebarPaperCategoryBadge) sidebarPaperCategoryBadge.textContent = paper.category || t("category.uncategorized");
    if (sidebarBackToPapers) sidebarBackToPapers.textContent = t("category.backToPapers");
    renderPaperCategorySelect();
    renderQuestionList();
    renderQuestionEditor();
    return;
  }

  libraryPanel.classList.remove("hidden");
  paperQuestionSection?.classList.add("hidden");

  if (editSidebarLevel === "categories") {
    // -------------------------------------------------------------
    // LEVEL 1: CATEGORIES
    // -------------------------------------------------------------
    libraryPanel.innerHTML = `
      <div class="library-heading">
        <strong>${t("category.libraryTitle")}</strong>
        <span>${counts.allCount}</span>
      </div>
      <div class="category-nav-list" role="navigation" aria-label="${t("category.title")}">
        <div class="category-nav-row ${selectedCategory === ALL_PAPERS_CATEGORY ? "active" : ""}">
          <button class="category-nav-item" type="button" data-enter-category="${ALL_PAPERS_CATEGORY}" aria-label="${t("category.allPapers")} (${counts.allCount})">
            <span class="category-nav-label">📋 ${t("category.allPapers")}</span>
            <span class="category-nav-count">${counts.allCount}</span>
          </button>
        </div>
        ${library.categories.map((cat) => `
          <div class="category-nav-row ${selectedCategory === cat ? "active" : ""}">
            <button class="category-nav-item" type="button" data-enter-category="${escapeHtml(cat)}" aria-label="${escapeHtml(cat)} (${counts.categoryCounts[cat] || 0})">
              <span class="category-nav-label">📁 ${escapeHtml(cat)}</span>
              <span class="category-nav-count">${counts.categoryCounts[cat] || 0}</span>
            </button>
            <span class="category-item-actions">
              <button type="button" class="category-action-btn" data-rename-category="${escapeHtml(cat)}" title="${t("category.renameCategory")}" aria-label="${t("category.renameCategory")}: ${escapeHtml(cat)}">✎</button>
              <button type="button" class="category-action-btn danger-action" data-delete-category="${escapeHtml(cat)}" title="${t("category.deleteCategory")}" aria-label="${t("category.deleteCategory")}: ${escapeHtml(cat)}">🗑</button>
            </span>
          </div>
        `).join("")}
        <div class="category-nav-row ${selectedCategory === UNCATEGORIZED_CATEGORY ? "active" : ""}">
          <button class="category-nav-item" type="button" data-enter-category="${UNCATEGORIZED_CATEGORY}" aria-label="${t("category.uncategorized")} (${counts.uncategorizedCount})">
            <span class="category-nav-label">📄 ${t("category.uncategorized")}</span>
            <span class="category-nav-count">${counts.uncategorizedCount}</span>
          </button>
        </div>
      </div>
      <div class="category-manage-actions">
        <button class="secondary-button small-button" type="button" id="newCategoryBtn">+ ${t("category.newCategory")}</button>
      </div>
      <div class="utility-row">
        <button class="secondary-button" id="exportBackup" type="button">${t("library.exportBackup")}</button>
        <label class="secondary-button file-label">
          <span>${t("library.importBackup")}</span>
          <input id="backupInput" type="file" accept="application/json,.json">
        </label>
      </div>
    `;

    document.getElementById("newCategoryBtn")?.addEventListener("click", promptCreateCategory);
    libraryPanel.querySelectorAll("[data-enter-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedCategory = btn.dataset.enterCategory;
        editSidebarLevel = "papers";
        renderLibraryPanel();
      });
    });
    libraryPanel.querySelectorAll("[data-rename-category]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        promptRenameCategory(btn.dataset.renameCategory);
      });
    });
    libraryPanel.querySelectorAll("[data-delete-category]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        promptDeleteCategory(btn.dataset.deleteCategory);
      });
    });
    document.getElementById("exportBackup")?.addEventListener("click", exportLibraryBackup);
    document.getElementById("backupInput")?.addEventListener("change", importLibraryBackup);
    return;
  }

  // -------------------------------------------------------------
  // LEVEL 2: PAPERS
  // -------------------------------------------------------------
  const query = librarySearch.trim().toLowerCase();
  const categoryFiltered = filterPapersByCategory(library.papers, selectedCategory);
  const papers = categoryFiltered
    .sort((first, second) => new Date(second.lastOpenedAt || second.updatedAt) - new Date(first.lastOpenedAt || first.updatedAt))
    .filter((item) => {
      const haystack = [item.title, item.category, ...(item.tags || [])].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

  const searchPlaceholder = selectedCategory === ALL_PAPERS_CATEGORY
    ? t("library.search")
    : selectedCategory === UNCATEGORIZED_CATEGORY
      ? `${t("library.search")} (${t("category.uncategorized")})`
      : `${t("library.search")} (${escapeHtml(selectedCategory)})`;

  libraryPanel.innerHTML = `
    <div class="sidebar-breadcrumb">
      <button type="button" class="back-link-btn" id="sidebarBackToCategories">${t("category.backToCategories")}</button>
    </div>
    <div class="category-current-header">
      <div class="category-header-title">
        <span>${getCategoryIcon(selectedCategory)}</span>
        <span>${escapeHtml(getCategoryDisplayName(selectedCategory))}</span>
      </div>
      <span class="category-badge">${categoryFiltered.length}</span>
    </div>
    <input id="librarySearch" type="search" value="${escapeHtml(librarySearch)}" placeholder="${escapeHtml(searchPlaceholder)}">
    <div class="library-actions">
      <button class="small-button" type="button" id="newPaper">${t("library.newPaper")}</button>
      <button class="small-button" type="button" id="duplicatePaper">${t("library.duplicatePaper")}</button>
      <button class="small-button" type="button" id="renamePaper">${t("library.renamePaper")}</button>
      <button class="danger-button small-button" type="button" id="deletePaper">${t("library.deletePaper")}</button>
    </div>
    <div class="library-list">
      ${papers.length ? papers.map(renderLibraryItem).join("") : `<div class="library-empty">${t("library.empty")}</div>`}
    </div>
  `;

  document.getElementById("sidebarBackToCategories")?.addEventListener("click", () => {
    editSidebarLevel = "categories";
    renderLibraryPanel();
  });
  document.getElementById("librarySearch")?.addEventListener("input", (event) => {
    librarySearch = event.target.value;
    renderLibraryPanel();
  });
  document.getElementById("newPaper")?.addEventListener("click", createLibraryPaper);
  document.getElementById("duplicatePaper")?.addEventListener("click", duplicateLibraryPaper);
  document.getElementById("renamePaper")?.addEventListener("click", renameLibraryPaper);
  document.getElementById("deletePaper")?.addEventListener("click", deleteLibraryPaper);

  libraryPanel.querySelectorAll("[data-open-paper]").forEach((button) => {
    button.addEventListener("click", () => {
      openLibraryPaper(button.dataset.openPaper);
    });
  });
}

async function promptCreateCategory() {
  const name = await promptStudyDeskText({
    title: t("category.newCategory"),
    message: t("category.newCategoryPrompt"),
    fallbackSelector: "#newCategoryBtn",
  });
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  if (isReservedCategoryName(trimmed)) {
    showToast(t("toast.categoryReserved"));
    return;
  }
  if (library.categories.includes(trimmed)) {
    showToast(t("toast.categoryExists"));
    selectedCategory = trimmed;
    editSidebarLevel = "papers";
    renderLibraryPanel();
    return;
  }
  library.categories = createCategory(library.categories, trimmed);
  selectedCategory = trimmed;
  editSidebarLevel = "papers";
  saveLibrary();
  renderAll();
  showToast(t("toast.categoryCreated"));
}

async function promptRenameCategory(oldName) {
  const newName = await promptStudyDeskText({
    title: t("category.renameCategory"),
    message: t("category.renameCategoryPrompt"),
    initialValue: oldName,
    fallbackSelector: `[data-rename-category="${CSS.escape(oldName)}"]`,
  });
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmedNew = newName.trim();
  if (isReservedCategoryName(trimmedNew)) {
    showToast(t("toast.categoryReserved"));
    return;
  }
  if (library.categories.includes(trimmedNew)) {
    showToast(t("toast.categoryExists"));
    return;
  }
  const result = renameCategory(library.categories, oldName, trimmedNew, library.papers);
  if (!result.success) {
    if (result.reason === "RESERVED") {
      showToast(t("toast.categoryReserved"));
    } else if (result.reason === "COLLISION") {
      showToast(t("toast.categoryExists"));
    }
    return;
  }
  library.categories = result.categoryList;
  library.papers = result.papers;
  if (selectedCategory === oldName) {
    selectedCategory = trimmedNew;
  }
  paper = getActivePaper();
  saveLibrary();
  renderAll();
  showToast(t("toast.categoryRenamed"));
}

async function promptDeleteCategory(categoryName) {
  const matchingPapers = library.papers.filter((p) => p.category === categoryName);
  if (matchingPapers.length === 0) {
    if (!await confirmStudyDeskAction({
      title: t("dialog.destructiveTitle"),
      message: t("category.deleteEmptyConfirm", { name: categoryName }),
      tone: "danger",
      fallbackSelector: "#newCategoryBtn",
    })) return;
    const result = deleteCategoryOnly(library.categories, categoryName, library.papers);
    library.categories = result.categoryList;
    if (selectedCategory === categoryName) selectedCategory = ALL_PAPERS_CATEGORY;
    saveLibrary();
    renderAll();
    showToast(t("toast.categoryDeleted"));
    return;
  }

  pendingDeleteCategoryName = categoryName;
  if (categoryDeleteTitle) categoryDeleteTitle.textContent = t("category.deleteCategoryTitle");
  if (categoryDeleteMessage) categoryDeleteMessage.textContent = t("category.deleteChoicePrompt", { name: categoryName, count: matchingPapers.length });
  if (deleteOnlyTitle) deleteOnlyTitle.textContent = t("category.deleteOnlyTitle");
  if (deleteOnlyDescription) deleteOnlyDescription.textContent = t("category.deleteOnlyDesc");
  if (btnDeleteCategoryOnly) btnDeleteCategoryOnly.textContent = t("category.deleteOnly");
  if (deleteWithPapersTitle) deleteWithPapersTitle.textContent = t("category.deleteWithPapersTitle");
  if (deleteWithPapersDescription) deleteWithPapersDescription.textContent = t("category.deleteWithPapersDesc", { count: matchingPapers.length });
  if (btnDeleteCategoryWithPapers) btnDeleteCategoryWithPapers.textContent = t("category.deleteWithPapers", { count: matchingPapers.length });
  if (btnCancelCategoryDelete) btnCancelCategoryDelete.textContent = t("actions.cancel");
  categoryDeleteDialog?.showModal();
}

function renderPaperCategorySelect() {
  if (!paperCategorySelect) return;
  const currentCategory = paper.category || "";
  const options = [
    `<option value="">${t("category.uncategorized")}</option>`,
    ...library.categories.map((cat) => `<option value="${escapeHtml(cat)}" ${cat === currentCategory ? "selected" : ""}>${escapeHtml(cat)}</option>`),
    `<option value="__NEW_CATEGORY__">+ ${t("category.newCategory")}...</option>`
  ];
  if (currentCategory && !library.categories.includes(currentCategory)) {
    options.splice(1, 0, `<option value="${escapeHtml(currentCategory)}" selected>${escapeHtml(currentCategory)}</option>`);
  }
  paperCategorySelect.innerHTML = options.join("");
}

function renderLibraryItem(item) {
  const isActive = item.id === activePaperId;
  const tags = (item.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  return `
    <button class="library-item ${isActive ? "active" : ""}" type="button" data-open-paper="${item.id}">
      <span>
        <strong>${escapeHtml(item.title || t("library.untitled"))}</strong>
        <small>${escapeHtml(item.category || t("category.uncategorized"))} · ${t("library.updated")} ${formatDate(item.updatedAt)}</small>
      </span>
      <span class="library-tags">${tags}${isActive ? `<span>${t("library.active")}</span>` : ""}</span>
    </button>
  `;
}

function createLibraryPaper() {
  const initialCategory = (selectedCategory !== ALL_PAPERS_CATEGORY && selectedCategory !== UNCATEGORIZED_CATEGORY)
    ? selectedCategory
    : "";
  const nextPaper = normalizePaper({
    id: makeId(),
    title: t("library.untitled"),
    description: "",
    category: initialCategory,
    tags: [],
    questions: [],
  });
  library.papers.push(nextPaper);
  activePaperId = nextPaper.id;
  localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
  selectedQuestionId = null;
  editSidebarLevel = "questions";
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
  editSidebarLevel = "questions";
  clearActiveSession();
  saveLibrary();
  renderAll();
  showToast(t("toast.paperDuplicated"));
}

async function renameLibraryPaper() {
  const nextTitle = await promptStudyDeskText({
    title: t("library.renamePaper"),
    message: t("library.renamePrompt"),
    initialValue: paper.title || t("library.untitled"),
    fallbackSelector: "#renamePaper",
  });
  if (!nextTitle) return;
  paper.title = nextTitle.trim();
  savePaper({ clearSession: false });
  renderAll();
  showToast(t("toast.paperRenamed"));
}

async function deleteLibraryPaper() {
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message: t("library.deleteConfirm"),
    tone: "danger",
    fallbackSelector: "#deletePaper",
  })) return;
  const target = library.papers.find((item) => item.id === activePaperId);
  const candidateIds = (target?.questions || []).flatMap((q) => [q.image?.id, q.audio?.id]).filter(Boolean);
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
  if (candidateIds.length) safeCleanupMedia(candidateIds);
}

function openLibraryPaper(id) {
  if (id !== activePaperId) {
    activePaperId = id;
    localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
    paper = getActivePaper();
    paper.lastOpenedAt = new Date().toISOString();
    selectedQuestionId = paper.questions[0]?.id ?? null;
    session = loadActiveSession();
    saveLibrary();
  }
  editSidebarLevel = "questions";
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
      ${renderQuestionMediaEditor(question)}
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
  bindQuestionMediaEditor(question);
  bindAnswerEditor(question);
}

function renderQuestionMediaEditor(question) {
  const hasImage = Boolean(question.image?.id);
  const hasAudio = Boolean(question.audio?.id);

  return `
    <div class="question-media-section">
      <!-- Image Box -->
      <div class="media-box" id="imageMediaBox">
        <div class="media-box-header">
          <span class="media-box-title">🖼 ${t("media.imageSection")}</span>
          ${hasImage ? `
            <div class="media-actions-row">
              <label class="small-button secondary-button media-upload-btn" title="${t("media.replaceImage")}">
                <span>${t("media.replaceImage")}</span>
                <input type="file" id="replaceQuestionImageInput" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">
              </label>
              <button class="small-button danger-button" type="button" id="removeQuestionImage">${t("media.removeImage")}</button>
            </div>
          ` : ""}
        </div>
        ${hasImage ? `
          <div class="media-preview-container">
            <div class="media-img-preview-wrapper">
              <img id="questionImagePreview" class="media-preview-img" src="" alt="${escapeHtml(question.image.alt || question.image.name)}">
            </div>
            <div class="media-info-row">
              <span class="media-file-name" title="${escapeHtml(question.image.name)}">${escapeHtml(question.image.name)}</span>
              <span>${formatFileSize(question.image.size)}</span>
            </div>
            <label>
              <span class="meta-text">${t("media.altTextLabel")}</span>
              <input type="text" id="questionImageAltInput" class="media-alt-input" value="${escapeHtml(question.image.alt || "")}" placeholder="${t("media.altTextPlaceholder")}">
            </label>
          </div>
        ` : `
          <div class="media-empty-state">
            <label class="secondary-button media-upload-btn">
              <span>${t("media.uploadImage")}</span>
              <input type="file" id="uploadQuestionImageInput" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">
            </label>
          </div>
        `}
      </div>

      <!-- Audio Box -->
      <div class="media-box" id="audioMediaBox">
        <div class="media-box-header">
          <span class="media-box-title">🎵 ${t("media.audioSection")}</span>
          ${hasAudio ? `
            <div class="media-actions-row">
              <label class="small-button secondary-button media-upload-btn" title="${t("media.replaceAudio")}">
                <span>${t("media.replaceAudio")}</span>
                <input type="file" id="replaceQuestionAudioInput" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/m4a,audio/flac">
              </label>
              <button class="small-button danger-button" type="button" id="removeQuestionAudio">${t("media.removeAudio")}</button>
            </div>
          ` : ""}
        </div>
        ${hasAudio ? `
          <div class="media-preview-container">
            <audio id="questionAudioPreview" controls preload="metadata" style="width:100%; height:36px;"></audio>
            <div class="media-info-row">
              <span class="media-file-name" title="${escapeHtml(question.audio.name)}">${escapeHtml(question.audio.name)}</span>
              <span>${formatFileSize(question.audio.size)}</span>
            </div>
          </div>
        ` : `
          <div class="media-empty-state">
            <label class="secondary-button media-upload-btn">
              <span>${t("media.uploadAudio")}</span>
              <input type="file" id="uploadQuestionAudioInput" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm,audio/aac,audio/m4a,audio/flac">
            </label>
          </div>
        `}
      </div>
    </div>
  `;
}

function bindQuestionMediaEditor(question) {
  if (question.image?.id) {
    getOrResolveMediaUrl(question.image.id).then((url) => {
      const preview = document.getElementById("questionImagePreview");
      if (preview && url) preview.src = url;
    });

    const altInput = document.getElementById("questionImageAltInput");
    altInput?.addEventListener("input", (e) => {
      if (question.image) {
        question.image.alt = e.target.value;
        savePaper({ clearSession: false });
      }
    });

    const removeImgBtn = document.getElementById("removeQuestionImage");
    removeImgBtn?.addEventListener("click", () => {
      const candidateId = question.image?.id;
      delete question.image;
      savePaper({ clearSession: false });
      renderQuestionEditor();
      if (candidateId) safeCleanupMedia([candidateId]);
    });

    const replaceImgInput = document.getElementById("replaceQuestionImageInput");
    replaceImgInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleQuestionImageUpload(question, file);
    });
  } else {
    const uploadImgInput = document.getElementById("uploadQuestionImageInput");
    uploadImgInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleQuestionImageUpload(question, file);
    });
  }

  if (question.audio?.id) {
    getOrResolveMediaUrl(question.audio.id).then((url) => {
      const preview = document.getElementById("questionAudioPreview");
      if (preview && url) preview.src = url;
    });

    const removeAudBtn = document.getElementById("removeQuestionAudio");
    removeAudBtn?.addEventListener("click", () => {
      const candidateId = question.audio?.id;
      delete question.audio;
      savePaper({ clearSession: false });
      renderQuestionEditor();
      if (candidateId) safeCleanupMedia([candidateId]);
    });

    const replaceAudInput = document.getElementById("replaceQuestionAudioInput");
    replaceAudInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleQuestionAudioUpload(question, file);
    });
  } else {
    const uploadAudInput = document.getElementById("uploadQuestionAudioInput");
    uploadAudInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleQuestionAudioUpload(question, file);
    });
  }
}

async function handleQuestionImageUpload(question, file) {
  if (!file) return;
  const validation = validateMediaFileCandidate(file, "image");
  if (!validation.valid) {
    showToast(t(validation.error || "media.unsupportedImageType"));
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const previousId = question.image?.id;
    const assetId = `img-${makeId()}`;
    await mediaStore.saveMediaAsset({
      id: assetId,
      mimeType: validation.normalizedMime || file.type || "image/png",
      name: file.name || "image.png",
      size: file.size || arrayBuffer.byteLength,
      data: arrayBuffer,
    });

    question.image = {
      id: assetId,
      mimeType: validation.normalizedMime || file.type || "image/png",
      name: file.name || "image.png",
      size: file.size || arrayBuffer.byteLength,
      alt: question.image?.alt || "",
    };

    savePaper({ clearSession: false });
    renderQuestionEditor();
    if (previousId && previousId !== assetId) safeCleanupMedia([previousId]);
  } catch {
    showToast(t("media.uploadFail"));
  }
}

async function handleQuestionAudioUpload(question, file) {
  if (!file) return;
  const validation = validateMediaFileCandidate(file, "audio");
  if (!validation.valid) {
    showToast(t(validation.error || "media.unsupportedAudioType"));
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const previousId = question.audio?.id;
    const assetId = `aud-${makeId()}`;
    await mediaStore.saveMediaAsset({
      id: assetId,
      mimeType: validation.normalizedMime || file.type || "audio/mpeg",
      name: file.name || "audio.mp3",
      size: file.size || arrayBuffer.byteLength,
      data: arrayBuffer,
    });

    question.audio = {
      id: assetId,
      mimeType: validation.normalizedMime || file.type || "audio/mpeg",
      name: file.name || "audio.mp3",
      size: file.size || arrayBuffer.byteLength,
    };

    savePaper({ clearSession: false });
    renderQuestionEditor();
    if (previousId && previousId !== assetId) safeCleanupMedia([previousId]);
  } catch {
    showToast(t("media.uploadFail"));
  }
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
        <div class="feedback-mode-block">
          <h4>${t("practice.feedbackModeTitle")}</h4>
          <div class="mode-options-grid">
            <label class="mode-option-card ${currentFeedbackMode === "instant" ? "selected" : ""}">
              <input type="radio" name="practiceFeedbackMode" value="instant" ${currentFeedbackMode === "instant" ? "checked" : ""}>
              <div class="mode-option-content">
                <strong>${t("practice.modeInstant")}</strong>
                <small>${t("practice.modeInstantDesc")}</small>
              </div>
            </label>
            <label class="mode-option-card ${currentFeedbackMode === "submitAtEnd" ? "selected" : ""}">
              <input type="radio" name="practiceFeedbackMode" value="submitAtEnd" ${currentFeedbackMode === "submitAtEnd" ? "checked" : ""}>
              <div class="mode-option-content">
                <strong>${t("practice.modeSubmitAtEnd")}</strong>
                <small>${t("practice.modeSubmitAtEndDesc")}</small>
              </div>
            </label>
          </div>
        </div>
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

  document.querySelectorAll("input[name='practiceFeedbackMode']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      currentFeedbackMode = e.target.value;
      document.querySelectorAll(".mode-option-card").forEach((card) => {
        const input = card.querySelector("input[type='radio']");
        card.classList.toggle("selected", Boolean(input && input.checked));
      });
    });
  });

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

  const selectedFeedbackMode = options.feedbackMode
    || document.querySelector("input[name='practiceFeedbackMode']:checked")?.value
    || currentFeedbackMode
    || "instant";

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
    feedbackMode: selectedFeedbackMode,
  };
  persistSession();
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const question = session.questions[session.index];
  const progress = Math.round((session.index / session.questions.length) * 100);
  const answeredCount = session.questions.filter((item) => isAnswerComplete(item, session.answers[item.id])).length;
  const unansweredCount = session.questions.length - answeredCount;
  const isSubmitAtEnd = session.feedbackMode === "submitAtEnd";
  const isLastQuestion = session.index === session.questions.length - 1;

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
      ${renderQuestionMediaView(question)}
      ${!isSubmitAtEnd && session.feedback ? renderFeedback(session.feedback) : ""}
      <div class="answer-list">
        ${renderQuizAnswer(question)}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="quitQuiz">${t("actions.quit")}</button>
        <button class="secondary-button" type="button" id="previousQuestion" ${session.index === 0 ? "disabled" : ""}>${t("actions.previousQuestion")}</button>
        ${isSubmitAtEnd ? `
          ${isLastQuestion ? `
            <button class="primary-button" type="button" id="submitQuizAtEnd">${t("actions.submitPaper")}</button>
          ` : `
            <button class="primary-button" type="button" id="nextQuestion">${t("actions.nextQuestion")}</button>
          `}
        ` : `
          <button class="primary-button" type="button" id="${session.submitted ? "nextQuestion" : "submitAnswer"}">${session.submitted ? nextLabel() : t("actions.submitAnswer")}</button>
        `}
      </div>
    </div>
  `;

  bindQuestionMediaView(question);
  bindQuizAnswer(question);
  document.getElementById("quitQuiz").addEventListener("click", () => {
    persistSession();
    renderQuizStart();
  });
  document.getElementById("previousQuestion").addEventListener("click", goPreviousQuestion);

  if (isSubmitAtEnd) {
    if (isLastQuestion) {
      document.getElementById("submitQuizAtEnd")?.addEventListener("click", submitQuizAtEnd);
    } else {
      document.getElementById("nextQuestion")?.addEventListener("click", goNextQuestion);
    }
  } else {
    if (session.submitted) {
      document.getElementById("nextQuestion")?.addEventListener("click", goNextQuestion);
    } else {
      document.getElementById("submitAnswer").addEventListener("click", submitCurrentAnswer);
    }
  }
}

function renderQuestionMediaView(question) {
  const hasImage = Boolean(question.image?.id);
  const hasAudio = Boolean(question.audio?.id);
  if (!hasImage && !hasAudio) return "";

  return `
    <div class="question-media-stack">
      ${hasImage ? `
        <div class="question-image-box">
          <div class="question-image-wrapper" id="quizQuestionImageWrapper" role="button" tabindex="0" title="${t("media.zoomHint")}" aria-label="${escapeHtml(question.image.alt || t("media.zoomImage"))}">
            <img id="quizQuestionImage" class="question-image" src="" alt="${escapeHtml(question.image.alt || question.image.name)}">
            <span class="image-zoom-badge">🔍 ${t("media.zoomHint")}</span>
          </div>
          ${question.image.alt ? `<span class="question-image-alt">${escapeHtml(question.image.alt)}</span>` : ""}
        </div>
      ` : ""}
      ${hasAudio ? `
        <div class="question-audio-box">
          <audio id="quizQuestionAudio" class="question-audio-player" controls preload="auto"></audio>
        </div>
      ` : ""}
    </div>
  `;
}

function bindQuestionMediaView(question) {
  if (question.image?.id) {
    getOrResolveMediaUrl(question.image.id).then((url) => {
      const img = document.getElementById("quizQuestionImage");
      if (img && url) {
        img.src = url;
        const wrapper = document.getElementById("quizQuestionImageWrapper");
        const onOpen = () => openImageViewer(url, question.image.alt || question.image.name);
        wrapper?.addEventListener("click", onOpen);
        wrapper?.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        });
      }
    });
  }

  if (question.audio?.id) {
    getOrResolveMediaUrl(question.audio.id).then((url) => {
      const audio = document.getElementById("quizQuestionAudio");
      if (audio && url) audio.src = url;
    });
  }
}

function renderQuizAnswer(question) {
  const answer = session.answers[question.id];
  const isSubmitted = session.feedbackMode === "submitAtEnd" ? false : session.submitted;

  if (question.type === "single" || question.type === "multiple") {
    return question.options
      .map((option, index) => {
        const checked = question.type === "single"
          ? answer === option.id
          : Array.isArray(answer) && answer.includes(option.id);
        return `
          <label class="choice-line ${checked ? "selected" : ""}">
            <input type="${question.type === "single" ? "radio" : "checkbox"}" name="choiceAnswer" value="${option.id}" ${checked ? "checked" : ""} ${isSubmitted ? "disabled" : ""}>
            <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
            ${checked ? `<svg class="ink-mark-svg" viewBox="0 0 20 20" fill="none"><path class="ink-stroke-path drawn" d="M4 10.5 L8.5 15 L16 5" stroke="var(--brand-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
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
        <input id="blankAnswer" type="text" value="${escapeHtml(answer || "")}" ${isSubmitted ? "disabled" : ""}>
      </label>
    `;
  }

  if (question.type === "truefalse") {
    return `
      <label class="judge-line ${answer === true ? "selected" : ""}">
        <input type="radio" name="judgeAnswer" value="true" ${answer === true ? "checked" : ""} ${isSubmitted ? "disabled" : ""}>
        ${answer === true ? `<svg class="ink-mark-svg" viewBox="0 0 20 20" fill="none"><path class="ink-stroke-path drawn" d="M4 10.5 L8.5 15 L16 5" stroke="var(--brand-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
        <span>${t("question.true")}</span>
      </label>
      <label class="judge-line ${answer === false ? "selected" : ""}">
        <input type="radio" name="judgeAnswer" value="false" ${answer === false ? "checked" : ""} ${isSubmitted ? "disabled" : ""}>
        ${answer === false ? `<svg class="ink-mark-svg" viewBox="0 0 20 20" fill="none"><path class="ink-stroke-path drawn" d="M5 5 L15 15 M15 5 L5 15" stroke="var(--ink-vermilion)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
        <span>${t("question.false")}</span>
      </label>
    `;
  }

  return question.pairs
    .map((pair) => {
      const selectedId = answer?.[pair.id];
      const isPairCorrect = isSubmitted && selectedId === pair.rightId;
      const isPairWrong = isSubmitted && !isPairCorrect;
      const correctOptionText = question.rightOptions.find((opt) => opt.id === pair.rightId)?.text || "";

      return `
        <div class="match-item ${isSubmitted ? (isPairCorrect ? "match-correct" : "match-wrong") : ""}">
          <div class="match-line ${isSubmitted ? (isPairCorrect ? "line-correct" : "line-wrong") : ""}">
            <div class="match-left">
              ${isSubmitted ? `
                <span class="match-pair-status ${isPairCorrect ? "status-correct" : "status-wrong"}" aria-label="${isPairCorrect ? t("result.correct") : t("result.wrong")}">
                  ${isPairCorrect ? "✓" : "✕"}
                </span>
              ` : ""}
              <span class="match-term">${escapeHtml(pair.left)}</span>
            </div>
            <div class="match-right">
              <select data-match-answer="${pair.id}" ${isSubmitted ? "disabled" : ""}>
                <option value="">${t("question.choose")}</option>
                ${question.rightOptions.map((right) => `<option value="${right.id}" ${selectedId === right.id ? "selected" : ""}>${escapeHtml(right.text)}</option>`).join("")}
              </select>
            </div>
          </div>
          ${isPairWrong ? `
            <div class="match-correction-hint">
              <span class="match-hint-label">${t("result.correctAnswer")}:</span>
              <span class="match-hint-val">${escapeHtml(correctOptionText)}</span>
            </div>
          ` : ""}
        </div>
      `;
    })
    .join("");
}

function bindQuizAnswer(question) {
  if (session.feedbackMode !== "submitAtEnd" && session.submitted) return;

  if (question.type === "single") {
    document.querySelectorAll("input[name='choiceAnswer']").forEach((input) => {
      input.addEventListener("change", () => {
        studioAudio.playPencilStroke();
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
        studioAudio.playPencilStroke();
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
        studioAudio.playPencilStroke();
        session.answers[question.id] = input.value === "true";
        persistSession();
        renderCurrentQuestion();
      });
    });
    return;
  }

  document.querySelectorAll("[data-match-answer]").forEach((select) => {
    select.addEventListener("change", () => {
      studioAudio.playPencilStroke();
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

  studioAudio.playStampThud();
  const result = gradeQuestion(question, answer, getGradeLabels());
  session.results[session.index] = result;
  session.submitted = true;
  session.feedback = result;
  persistSession();
  renderCurrentQuestion();
}

function goPreviousQuestion() {
  if (session.index === 0) return;
  studioAudio.playPageTurn();
  session.index -= 1;
  if (session.feedbackMode === "submitAtEnd") {
    session.submitted = false;
    session.feedback = null;
  } else {
    session.submitted = Boolean(session.results[session.index]);
    session.feedback = session.results[session.index] || null;
  }
  persistSession();
  renderCurrentQuestion();
  triggerPageTurnAnimation(quizPanel, "prev");
}

function goNextQuestion() {
  if (session.index >= session.questions.length - 1) {
    if (session.feedbackMode === "submitAtEnd") {
      submitQuizAtEnd();
      return;
    }
    studioAudio.playStampThud();
    renderResults();
    return;
  }

  studioAudio.playPageTurn();
  session.index += 1;
  if (session.feedbackMode === "submitAtEnd") {
    session.submitted = false;
    session.feedback = null;
  } else {
    session.submitted = Boolean(session.results[session.index]);
    session.feedback = session.results[session.index] || null;
  }
  persistSession();
  renderCurrentQuestion();
  triggerPageTurnAnimation(quizPanel, "next");
}

function submitQuizAtEnd() {
  const answeredCount = session.questions.filter((item) => isAnswerComplete(item, session.answers[item.id])).length;
  const unansweredCount = session.questions.length - answeredCount;
  const confirmMessage = unansweredCount > 0
    ? t("practice.confirmSubmitUnanswered", { count: unansweredCount })
    : t("practice.confirmSubmitAllAnswered");

  if (!window.confirm(confirmMessage)) {
    return;
  }
  studioAudio.playStampThud();
  renderResults();
}

function triggerPageTurnAnimation(element, direction) {
  if (!element || document.documentElement.dataset.motion === "reduced") return;
  element.classList.remove("paper-page-turning-next", "paper-page-turning-prev");
  void element.offsetWidth;
  element.classList.add(direction === "next" ? "paper-page-turning-next" : "paper-page-turning-prev");
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
              <div class="review-status-row">
                <span class="review-status-pill ${result.correct ? "status-correct" : "status-wrong"}">
                  ${result.correct ? "✓ " + t("result.correct") : "✕ " + t("result.wrong")}
                </span>
                <span class="type-pill">${typeLabel(question.type)}</span>
              </div>
              <strong class="review-question-prompt">${index + 1}. ${escapeHtml(question.prompt)}</strong>
              ${(question.image || question.audio) ? `
                <div class="review-media-preview" data-review-media="${question.id}">
                  ${question.image ? `<img class="review-thumb-img" data-review-zoom="${question.image.id}" data-review-alt="${escapeHtml(question.image.alt || question.image.name)}" src="" alt="${escapeHtml(question.image.alt || question.image.name)}" title="${t("media.zoomHint")}">` : ""}
                  ${question.audio ? `<audio class="review-audio-inline" controls data-review-audio="${question.audio.id}" preload="none"></audio>` : ""}
                </div>
              ` : ""}
              <div class="answer-compare">
                ${question.type === "matching" ? `
                  <div class="matching-review-list">
                    ${question.pairs.map((pair) => {
                      const selId = session.answers[question.id]?.[pair.id];
                      const isCorrect = selId === pair.rightId;
                      const selText = question.rightOptions.find((opt) => opt.id === selId)?.text || t("result.noAnswer");
                      const corText = question.rightOptions.find((opt) => opt.id === pair.rightId)?.text || "";
                      return `
                        <div class="matching-review-row ${isCorrect ? "correct" : "wrong"}">
                          <div class="matching-review-pair">
                            <span class="review-status-pill ${isCorrect ? "status-correct" : "status-wrong"}">${isCorrect ? "✓" : "✕"}</span>
                            <strong>${escapeHtml(pair.left)}</strong> &rarr; <span class="learner-answer-val">${escapeHtml(selText)}</span>
                          </div>
                          ${!isCorrect ? `
                            <div class="matching-review-correct">
                              <span class="answer-label">${t("result.correctAnswer")}:</span>
                              <span class="correct-answer-val">${escapeHtml(corText)}</span>
                            </div>
                          ` : ""}
                        </div>
                      `;
                    }).join("")}
                  </div>
                ` : `
                  <div class="answer-row learner-answer-row">
                    <span class="answer-label">${t("result.yourAnswer")}:</span>
                    <span class="learner-answer-val">${escapeHtml(formatAnswer(question, session.answers[question.id], getGradeLabels()) || t("result.noAnswer"))}</span>
                  </div>
                  <div class="answer-row correct-answer-row">
                    <span class="answer-label">${result.correctLabel}:</span>
                    <span class="correct-answer-val">${escapeHtml(result.correctAnswer)}</span>
                  </div>
                `}
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

  quizPanel.querySelectorAll("[data-review-zoom]").forEach((img) => {
    const assetId = img.dataset.reviewZoom;
    const alt = img.dataset.reviewAlt;
    getOrResolveMediaUrl(assetId).then((url) => {
      if (url) {
        img.src = url;
        img.addEventListener("click", () => openImageViewer(url, alt));
      }
    });
  });

  quizPanel.querySelectorAll("[data-review-audio]").forEach((aud) => {
    const assetId = aud.dataset.reviewAudio;
    getOrResolveMediaUrl(assetId).then((url) => {
      if (url) aud.src = url;
    });
  });

  document.getElementById("backToEditorAfterResult").addEventListener("click", () => setMode("edit"));
  document.getElementById("exportResponseAfterResult").addEventListener("click", () => exportLearnerResponse(learnerResponse.id));
  document.getElementById("retryQuiz").addEventListener("click", () => startQuiz());
  document.getElementById("retryWrongAfterResult").addEventListener("click", () => startQuiz({ questionIds: missedQuestionIds, wrongOnly: true }));
}

function renderFeedback(result) {
  return `
    <div class="feedback ${result.correct ? "correct" : "wrong"}" role="status" aria-live="polite">
      <span class="feedback-icon">${result.correct ? "✓" : "✕"}</span>
      <div class="feedback-content">
        <strong class="feedback-title">${result.correct ? t("result.correctFeedback") : t("result.wrongFeedback")}</strong>
        <p class="feedback-explanation">${escapeHtml(result.correctAnswer)}</p>
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

async function deleteQuestion(id) {
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message: t("question.deleteConfirm"),
    tone: "danger",
    fallbackSelector: "[data-add-type]",
  })) return;
  const target = paper.questions.find((question) => question.id === id);
  const candidateIds = [target?.image?.id, target?.audio?.id].filter(Boolean);
  paper.questions = paper.questions.filter((question) => question.id !== id);
  selectedQuestionId = paper.questions[0]?.id ?? null;
  savePaper();
  renderAll();
  showToast(t("toast.deleted"));
  if (candidateIds.length) safeCleanupMedia(candidateIds);
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

async function exportPaper() {
  try {
    const normalized = normalizePaper(paper);
    const assetIds = collectReferencedMediaIds({ activePaper: normalized });
    const assets = await mediaStore.exportMediaAssets(Array.from(assetIds));
    const pkg = createPortablePaperPackage(normalized, assets);
    downloadJson(pkg, `${safeFileName(paper.title || "quiz-paper")}.json`);
  } catch (err) {
    showToast(t("toast.exportFail") || "Export failed");
  }
}

function importPaper(event) {
  const file = event.target.files[0];
  if (!file) return;

  readJsonFile(file, async (imported) => {
    try {
      const { paper: parsedPaper, assets } = parsePortablePaperPackage(imported);
      if (assets.length) {
        await mediaStore.importMediaAssets(assets);
      }
      const nextPaper = normalizePaper({
        ...parsedPaper,
        id: makeId(),
        createdAt: undefined,
        updatedAt: undefined,
        lastOpenedAt: undefined,
      });
      library.papers.push(nextPaper);
      activePaperId = nextPaper.id;
      localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
      selectedQuestionId = nextPaper.questions[0]?.id ?? null;
      editSidebarLevel = "questions";
      clearActiveSession();
      saveLibrary();
      renderAll();
      showToast(t("library.paperImported"));
    } catch {
      showToast(t("toast.importFail"));
    }
  }, () => showToast(t("toast.importFail")));

  event.target.value = "";
}

async function exportLibraryBackup() {
  try {
    const referencedIds = collectReferencedMediaIds({
      library,
      learnerResponses: loadLearnerResponses(),
      session: loadActiveSession(),
    });
    const mediaAssets = await mediaStore.exportMediaAssets(Array.from(referencedIds));
    if (mediaAssets.length < referencedIds.size) {
      throw new Error("Missing one or more referenced media assets in storage.");
    }

    const backup = createLibraryBackup({
      library,
      history: loadHistory(),
      learnerResponses: loadLearnerResponses(),
      teacherReviews: loadTeacherReviews(),
      translationLibrary: loadTranslationLibrary(),
      mediaAssets,
    });
    downloadJson(backup, `quiz-studio-backup-${new Date().toISOString().slice(0, 10)}.json`);
  } catch {
    showToast(t("library.backupExportFail"));
  }
}

function importLibraryBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  readJsonFile(file, async (imported) => {
    try {
      if (imported.library?.papers?.length) {
        const restored = parseLibraryBackup(imported, { createDefaultPaper });
        if (restored.mediaAssets?.length) {
          await mediaStore.importMediaAssets(restored.mediaAssets);
        }
        if (restored.hasLearnerResponses) saveJson(LEARNER_RESPONSES_KEY, restored.learnerResponses);
        if (restored.hasTeacherReviews) saveJson(TEACHER_REVIEWS_KEY, restored.teacherReviews);
        if (restored.hasTranslationLibrary) {
          saveJson(TRANSLATION_LIBRARY_KEY, restored.translationLibrary);
          translationLibrary = restored.translationLibrary;
          if (!translationLibrary.documents.some((doc) => doc.id === selectedTranslationDocumentId)) {
            selectedTranslationDocumentId = translationLibrary.documents[0]?.id || null;
          }
        }
        saveJson(HISTORY_KEY, restored.history);
        library = restored.library;
        activePaperId = library.papers[0].id;
        localStorage.setItem(ACTIVE_PAPER_KEY, activePaperId);
        showToast(t("library.backupImported"));
      } else if (Array.isArray(imported.questions) || (imported.documentType === "quiz-studio.quiz-paper" && imported.paper)) {
        const { paper: parsedPaper, assets } = parsePortablePaperPackage(imported);
        if (assets.length) {
          await mediaStore.importMediaAssets(assets);
        }
        const nextPaper = normalizePaper({ ...parsedPaper, id: makeId() });
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
    } catch {
      showToast(t("library.backupImportFail"));
    }
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
  return parseTeacherReviewCollection(saved ? JSON.parse(saved) : [], { learnerResponses: loadLearnerResponses() });
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
    <button type="button" class="back-to-hub-btn" id="backToSpecialPracticeHub">&larr; ${t("specialPractice.back")}</button>
    <div class="library-heading">
      <strong>${t("translation.title")}</strong>
      <span>${translationLibrary.documents.length}</span>
    </div>
    <div class="library-toolbar">
      <button class="small-button" type="button" id="newTranslationFolder">+ ${t("translation.newFolder")}</button>
      <button class="small-button" type="button" id="openTranslationHistory">📜 ${t("history.title")}</button>
    </div>
    <div class="library-list">
      ${translationLibrary.folders.length
        ? translationLibrary.folders.map(renderTranslationFolderBlock).join("")
        : `<div class="library-empty">${t("translation.emptyFolders")}</div>`}
    </div>
    <div class="translation-import">
      <div class="library-heading"><strong>${t("translation.importSection")}</strong></div>
      <div class="import-details-group">
        ${renderImportForms()}
      </div>
    </div>
  `;

  document.getElementById("backToSpecialPracticeHub")?.addEventListener("click", () => setMode("specialPractice"));
  document.getElementById("newTranslationFolder").addEventListener("click", createTranslationFolderPrompt);
  document.getElementById("openTranslationHistory").addEventListener("click", openTranslationHistory);
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

async function createTranslationFolderPrompt() {
  const name = await promptStudyDeskText({
    title: t("translation.newFolder"),
    message: t("translation.newFolderPrompt"),
    fallbackSelector: "#newTranslationFolder",
  });
  if (!name || !name.trim()) return;
  saveTranslationLibrary(createTranslationFolder(translationLibrary, { name: name.trim() }));
  renderTranslationView();
  showToast(t("toast.translationFolderCreated"));
}

async function renameTranslationFolderPrompt(folderId) {
  const folder = getTranslationFolder(translationLibrary, folderId);
  const name = await promptStudyDeskText({
    title: t("translation.renameFolder"),
    message: t("translation.renameFolderPrompt"),
    initialValue: folder?.name || "",
    fallbackSelector: `[data-rename-folder="${folderId}"]`,
  });
  if (!name || !name.trim()) return;
  saveTranslationLibrary(updateTranslationFolder(translationLibrary, folderId, { name: name.trim() }));
  renderTranslationView();
  showToast(t("toast.translationFolderRenamed"));
}

async function deleteTranslationFolderConfirm(folderId) {
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message: t("translation.deleteFolderConfirm"),
    tone: "danger",
    fallbackSelector: "#newTranslationFolder",
  })) return;
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
    <details class="translation-import-form">
      <summary class="small-button">${t("review.importRemediationMaterial")}</summary>
      <div class="translation-form">
        <p class="meta-text">${t("review.importRemediationHint")}</p>
        <label><span>${t("translation.importTargetFolder")}</span><select id="remediationImportFolder" ${disabled}>${folderOptions}</select></label>
        <label class="secondary-button file-label">
          <span>${t("actions.import")}</span>
          <input type="file" id="remediationImportFile" accept="application/json,.json" ${disabled}>
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

  const remediationFileInput = document.getElementById("remediationImportFile");
  if (remediationFileInput) {
    remediationFileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const folderId = document.getElementById("remediationImportFolder").value;
      const reader = new FileReader();
      reader.onload = () => {
        const { document: parsedDocument, errors } = parseRemediationTranslationDocumentText(reader.result);
        const provenanceValidation = parsedDocument
          ? validateRemediationImportProvenance(parsedDocument, { learnerResponses: loadLearnerResponses(), teacherReviews: loadTeacherReviews() })
          : { valid: true, errors: [] };
        remediationImportDraft = {
          folderId,
          document: parsedDocument,
          errors: [...errors, ...provenanceValidation.errors],
          allowCopy: false,
        };
        selectedTranslationDocumentId = null;
        translationPracticeActive = false;
        renderTranslationMainPanel();
      };
      reader.onerror = () => showToast(t("toast.remediationImportFail"));
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
  if (reviewImportDraft) {
    renderReviewImportPreview();
    return;
  }
  if (remediationImportDraft) {
    renderRemediationImportPreview();
    return;
  }
  if (translationHistoryDetailId) {
    renderHistoryDetail(translationHistoryDetailId);
    return;
  }
  if (translationHistoryOpen) {
    renderHistoryBrowser();
    return;
  }
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
                <button class="small-button" type="button" data-export-review-request="${response.id}">${t("review.exportReviewRequest")}</button>
                <label class="secondary-button small-button file-label">
                  <span>${t("review.importReview")}</span>
                  <input type="file" data-import-review="${response.id}" accept="application/json,.json">
                </label>
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
  document.querySelectorAll("[data-export-review-request]").forEach((button) => {
    button.addEventListener("click", () => exportReviewRequest(button.dataset.exportReviewRequest));
  });
  document.querySelectorAll("[data-import-review]").forEach((input) => {
    input.addEventListener("change", (event) => startTeacherReviewImport(input.dataset.importReview, event));
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

async function startTranslationPractice(documentId) {
  const doc = translationLibrary.documents.find((item) => item.id === documentId);
  if (!doc || !doc.items.length) return;
  if (translationSession && !translationSession.completed && translationSession.documentId !== doc.id) {
    if (!await confirmStudyDeskAction({
      title: t("dialog.progressTitle"),
      message: t("translationPractice.overwriteConfirm"),
      confirmLabel: t("dialog.continue"),
      tone: "danger",
      fallbackSelector: "#startTranslationPractice",
    })) return;
  }
  translationSession = createTranslationSession({ document: doc });
  translationPracticeActive = true;
  persistTranslationSession();
  renderTranslationMainPanel();
}

async function discardTranslationPractice() {
  if (!await confirmStudyDeskAction({
    title: t("dialog.progressTitle"),
    message: t("translationPractice.discardConfirm"),
    confirmLabel: t("dialog.continue"),
    tone: "danger",
    fallbackSelector: "#discardTranslationPractice",
  })) return;
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
  const currentItemMark = activeSession.itemMarks?.[item.id] || null;

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
      <div class="item-mark-toolbar">
        <span class="meta-text">${t("translationPractice.markItemAs")}</span>
        <button type="button" class="small-button item-mark-button item-mark-unknown ${currentItemMark === "unknown" ? "active" : ""}" data-item-mark-kind="unknown" aria-pressed="${currentItemMark === "unknown"}">${t("translationPractice.kind.unknown")}</button>
        <button type="button" class="small-button item-mark-button item-mark-uncertain ${currentItemMark === "uncertain" ? "active" : ""}" data-item-mark-kind="uncertain" aria-pressed="${currentItemMark === "uncertain"}">${t("translationPractice.kind.uncertain")}</button>
        <button type="button" class="small-button item-mark-button item-mark-should_know ${currentItemMark === "should_know" ? "active" : ""}" data-item-mark-kind="should_know" aria-pressed="${currentItemMark === "should_know"}">${t("translationPractice.kind.should_know")}</button>
        ${currentItemMark ? `<button type="button" class="secondary-button small-button" data-clear-item-mark="true">${t("translationPractice.clearMark")}</button>` : ""}
      </div>
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
  document.querySelectorAll("[data-item-mark-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      studioAudio.playPencilStroke();
      const kind = button.dataset.itemMarkKind;
      const nextKind = currentItemMark === kind ? null : kind;
      translationSession = setTranslationItemMark(translationSession, item.id, nextKind);
      persistTranslationSession();
      renderTranslationMainPanel();
      focusAfterRerender(`[data-item-mark-kind="${kind}"]`);
    });
  });
  document.querySelector("[data-clear-item-mark]")?.addEventListener("click", () => {
    studioAudio.playPencilStroke();
    translationSession = setTranslationItemMark(translationSession, item.id, null);
    persistTranslationSession();
    renderTranslationMainPanel();
    focusAfterRerender(`[data-item-mark-kind="${currentItemMark}"]`);
  });
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
    if (translationSession.index <= 0) return;
    studioAudio.playPageTurn();
    translationSession = goToTranslationIndex(translationSession, translationSession.index - 1);
    persistTranslationSession();
    renderTranslationMainPanel();
    triggerPageTurnAnimation(translationDocumentPanel, "prev");
  });
  document.getElementById("nextTranslationItem").addEventListener("click", () => {
    if (translationSession.index >= translationSession.items.length - 1) return;
    studioAudio.playPageTurn();
    translationSession = goToTranslationIndex(translationSession, translationSession.index + 1);
    persistTranslationSession();
    renderTranslationMainPanel();
    triggerPageTurnAnimation(translationDocumentPanel, "next");
  });
  document.getElementById("finishTranslationPractice").addEventListener("click", () => {
    studioAudio.playStampThud();
    finishTranslationPractice();
  });

  document.getElementById("revealTranslationReference")?.addEventListener("click", () => {
    translationSession = setTranslationRevealed(translationSession, item.id, !revealed);
    persistTranslationSession();
    renderTranslationMainPanel();
    focusAfterRerender("#revealTranslationReference");
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
      focusAfterRerender(`[data-change-annotation-kind="${select.dataset.changeAnnotationKind}"]`);
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
            ${((completedSession.annotations[item.id] || []).length || completedSession.itemMarks?.[item.id]) ? `
              <div class="annotation-list">
                ${completedSession.itemMarks?.[item.id] ? `
                  <div class="annotation-row">
                    <span class="annotation-kind-pill annotation-kind-${completedSession.itemMarks[item.id]}">${t("translationPractice.wholeQuestionMark")}: ${t(`translationPractice.kind.${completedSession.itemMarks[item.id]}`)}</span>
                    <span class="annotation-text">${t("translationPractice.entireQuestionMarked")}</span>
                  </div>
                ` : ""}
                ${(completedSession.annotations[item.id] || []).map(renderAnnotationRowReadOnly).join("")}
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" id="backToDocumentAfterPractice" type="button">${t("translationPractice.backToDocument")}</button>
        <button class="secondary-button" id="exportTranslationResponseAfterPractice" type="button">${t("actions.exportResponse")}</button>
        <button class="secondary-button" id="exportReviewRequestAfterPractice" type="button">${t("review.exportReviewRequest")}</button>
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
  document.getElementById("exportReviewRequestAfterPractice").addEventListener("click", () => exportReviewRequest(translationLastResponseId));
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

function createFreshReviewDraft(responseId) {
  return normalizeTeacherReview({
    schemaVersion: 1,
    documentType: DOCUMENT_TYPES.TEACHER_REVIEW,
    id: makeId(),
    responseId,
    createdAt: new Date().toISOString(),
    reviewer: { type: "human" },
    itemReviews: [],
    remediationRecommendations: [],
  });
}

function reviewerLabel(reviewer) {
  if (!reviewer) return "-";
  return reviewer.displayLabel || reviewer.toolName || reviewer.type || "-";
}

function renderReviewPicker(response, availableReviews) {
  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${t("review.workspaceTitle")}</span>
        <div class="row-actions">
          <button class="secondary-button small-button" type="button" id="exitCorrectionWorkspace">${t("review.back")}</button>
        </div>
      </div>
      <p class="meta-text">${t("review.availableReviews")}</p>
      <div class="review-list">
        ${availableReviews.map((review) => `
          <div class="review-item">
            <span class="meta-text">${escapeHtml(reviewerLabel(review.reviewer))} &middot; ${escapeHtml(review.id)}</span>
            <div class="row-actions">
              <button class="small-button" type="button" data-open-specific-review="${review.id}">${t("review.openReview")}</button>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="primary-button" type="button" id="startNewReview">${t("review.newReview")}</button>
    </div>
  `;

  document.getElementById("exitCorrectionWorkspace").addEventListener("click", () => {
    correctionWorkspaceResponseId = null;
    correctionReviewDraft = null;
    translationPracticeActive = false;
    renderTranslationMainPanel();
  });
  document.querySelectorAll("[data-open-specific-review]").forEach((button) => {
    button.addEventListener("click", () => {
      correctionReviewDraft = availableReviews.find((review) => review.id === button.dataset.openSpecificReview);
      renderTranslationMainPanel();
    });
  });
  document.getElementById("startNewReview").addEventListener("click", () => {
    correctionReviewDraft = createFreshReviewDraft(response.id);
    renderTranslationMainPanel();
  });
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

  const availableReviews = findTeacherReviewsForResponse(loadTeacherReviews(), responseId);

  if (!correctionReviewDraft || correctionReviewDraft.responseId !== responseId) {
    correctionItemIndex = 0;
    if (availableReviews.length === 1) {
      correctionReviewDraft = availableReviews[0];
    } else if (availableReviews.length === 0) {
      correctionReviewDraft = createFreshReviewDraft(responseId);
    } else {
      correctionReviewDraft = null;
    }
  }

  if (!correctionReviewDraft) {
    renderReviewPicker(response, availableReviews);
    return;
  }

  const isPersistedReview = availableReviews.some((review) => review.id === correctionReviewDraft.id);
  const items = response.material.snapshot.items;
  const total = items.length;
  correctionItemIndex = Math.min(Math.max(correctionItemIndex, 0), total - 1);
  const item = items[correctionItemIndex];
  const answerEntry = response.responses.find((entry) => entry.itemId === item.id);
  const answerText = typeof answerEntry?.answer === "string" ? answerEntry.answer : "";
  const itemReview = getWorkspaceItemReview(item.id);
  const corrections = itemReview.corrections || [];
  const annotations = (response.learnerAnnotations || []).filter((annotation) => annotation.itemId === item.id);
  const itemMark = (response.learnerItemMarks || []).find((mark) => mark.itemId === item.id);
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
      ${availableReviews.length ? `
        <div class="review-switcher">
          <span class="meta-text">${t("review.availableReviews")}</span>
          ${availableReviews.map((review) => `
            <button class="small-button ${review.id === correctionReviewDraft.id ? "active" : ""}" type="button" data-switch-review="${review.id}">${escapeHtml(reviewerLabel(review.reviewer))}</button>
          `).join("")}
          <button class="small-button" type="button" id="startNewReviewInline">${t("review.newReview")}</button>
        </div>
      ` : ""}
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
      ${(annotations.length || itemMark) ? `
        <span class="meta-text">${t("review.learnerMarks")}</span>
        <div class="annotation-list">
          ${itemMark ? `
            <div class="annotation-row">
              <span class="annotation-kind-pill annotation-kind-${itemMark.kind}">${t("translationPractice.wholeQuestionMark")}: ${t(`translationPractice.kind.${itemMark.kind}`)}</span>
              <span class="annotation-text">${t("translationPractice.entireQuestionMarked")}</span>
            </div>
          ` : ""}
          ${annotations.map(renderAnnotationRowReadOnly).join("")}
        </div>
      ` : ""}
      <div class="correction-toolbar">
        <span class="meta-text">${t("review.applyCorrection")}</span>
        <button class="small-button" type="button" data-style="bold">${t("review.bold")}</button>
        <button class="small-button" type="button" data-style="italic">${t("review.italic")}</button>
        <button class="small-button" type="button" data-style="underline">${t("review.underline")}</button>
        <button class="small-button" type="button" data-style="highlight">${t("review.highlight")}</button>
        <button class="small-button" type="button" data-style="bracket">${t("review.bracket")}</button>
        <select id="correctionColorSelect" aria-label="${t("review.textColor")}">
          <option value="">${t("review.colorDefault")}</option>
          ${CORRECTION_COLORS.map((color) => `<option value="${color}">${t(`review.color.${color}`)}</option>`).join("")}
        </select>
        <button class="small-button" type="button" id="applyColorCorrection">${t("review.textColor")}</button>
        <button class="small-button" type="button" id="applyInsertCorrection">${t("review.insert")}</button>
        <button class="small-button" type="button" id="applyReplaceCorrection">${t("review.replace")}</button>
        <button class="small-button" type="button" id="applyDeleteCorrection">${t("review.delete")}</button>
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
        ${itemReview.judgment ? `
          <div style="display: flex; align-items: flex-end;">
            <span class="ink-stamp stamp-${itemReview.judgment}" id="judgmentStamp">
              ${itemReview.judgment === "correct" ? "✓ " : itemReview.judgment === "incorrect" ? "✕ " : "✎ "}
              ${t(`review.judgment${itemReview.judgment === "needs-review" ? "NeedsReview" : itemReview.judgment.charAt(0).toUpperCase() + itemReview.judgment.slice(1)}`)}
            </span>
          </div>
        ` : ""}
      </div>
      <label><span>${t("review.itemComment")}</span><textarea id="correctionItemComment" rows="2">${escapeHtml(itemReview.comment || "")}</textarea></label>
      <label><span>${t("review.suggestedRevision")}</span><textarea id="correctionSuggestedRevision" rows="2">${escapeHtml(itemReview.suggestedRevision || "")}</textarea></label>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="previousCorrectionItem" ${correctionItemIndex === 0 ? "disabled" : ""}>${t("actions.previousQuestion")}</button>
        <button class="secondary-button" type="button" id="nextCorrectionItem" ${correctionItemIndex === total - 1 ? "disabled" : ""}>${t("actions.nextQuestion")}</button>
        ${isPersistedReview ? `
          <button class="secondary-button" type="button" id="exportReviewJson">${t("review.exportReviewJson")}</button>
          <button class="secondary-button" type="button" id="exportRemediationRequest">${t("review.exportRemediationRequest")}</button>
          <button class="danger-button secondary-button" type="button" id="deleteCurrentReview">${t("review.deleteReview")}</button>
        ` : ""}
        <button class="primary-button" type="button" id="saveCorrectionReview">${t("review.save")}</button>
      </div>
    </div>
  `;

  bindCorrectionWorkspaceEvents(response, item, answerText, availableReviews);
}

function renderProjectionHtml(segments) {
  return segments.map((segment) => {
    const bracketsBefore = "[".repeat(segment.bracketsBefore || 0);
    const bracketsAfter = "]".repeat(segment.bracketsAfter || 0);
    if (segment.type === "deleted" || segment.type === "replaced-original") {
      return `${bracketsBefore}<span class="correction-deleted">${escapeHtml(segment.text)}</span>${bracketsAfter}`;
    }
    if (segment.type === "inserted") {
      const colorClass = segment.color ? ` correction-color-${segment.color}` : "";
      return `${bracketsBefore}<span class="correction-inserted${colorClass}">${escapeHtml(segment.text)}</span>${bracketsAfter}`;
    }
    const classes = segment.styles.map((style) => (style.styleType === "color"
      ? `correction-color-${style.color}`
      : `correction-style-${style.styleType}`));
    const title = segment.comments.length ? ` title="${escapeHtml(segment.comments.join(" | "))}"` : "";
    return `${bracketsBefore}<span class="${classes.join(" ")}"${title}>${escapeHtml(segment.text)}</span>${bracketsAfter}`;
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

function bindCorrectionWorkspaceEvents(response, item, answerText, availableReviews) {
  document.getElementById("exitCorrectionWorkspace").addEventListener("click", () => {
    correctionWorkspaceResponseId = null;
    correctionReviewDraft = null;
    translationPracticeActive = false;
    renderTranslationMainPanel();
  });
  document.querySelectorAll("[data-switch-review]").forEach((button) => {
    button.addEventListener("click", () => {
      correctionReviewDraft = availableReviews.find((review) => review.id === button.dataset.switchReview);
      renderTranslationMainPanel();
    });
  });
  document.getElementById("startNewReviewInline")?.addEventListener("click", () => {
    correctionReviewDraft = createFreshReviewDraft(response.id);
    renderTranslationMainPanel();
  });
  document.getElementById("exportReviewJson")?.addEventListener("click", () => exportCurrentReviewJson(response));
  document.getElementById("exportRemediationRequest")?.addEventListener("click", () => exportCurrentRemediationRequest(response));
  document.getElementById("deleteCurrentReview")?.addEventListener("click", () => deleteTeacherReviewConfirm(correctionReviewDraft.id));
  document.querySelectorAll("[data-style]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => applyStyleCorrection(item.id, answerText, button.dataset.style));
  });
  const colorButton = document.getElementById("applyColorCorrection");
  colorButton.addEventListener("mousedown", (event) => event.preventDefault());
  colorButton.addEventListener("click", () => {
    const color = document.getElementById("correctionColorSelect").value;
    if (!color) {
      showToast(t("toast.correctionColorRequired"));
      return;
    }
    applyStyleCorrection(item.id, answerText, "color", color);
  });
  ["applyInsertCorrection", "applyReplaceCorrection", "applyDeleteCorrection"].forEach((id) => {
    document.getElementById(id).addEventListener("mousedown", (event) => event.preventDefault());
  });
  document.getElementById("applyInsertCorrection").addEventListener("click", () => applyInsertCorrection(item.id, answerText));
  document.getElementById("applyReplaceCorrection").addEventListener("click", () => applyReplaceCorrection(item.id, answerText));
  document.getElementById("applyDeleteCorrection").addEventListener("click", () => applyDeleteCorrection(item.id, answerText));
  document.querySelectorAll("[data-remove-correction]").forEach((button) => {
    button.addEventListener("click", () => removeWorkspaceCorrection(item.id, button.dataset.removeCorrection, "#applyDeleteCorrection"));
  });
function triggerStampAnimation(stamp) {
  if (stamp && document.documentElement.dataset.motion !== "reduced") {
    stamp.classList.remove("stamping");
    void stamp.offsetWidth;
    stamp.classList.add("stamping");
  }
}

  document.getElementById("correctionJudgment").addEventListener("change", (event) => {
    studioAudio.playStampThud();
    updateWorkspaceItemReview(item.id, { judgment: event.target.value || undefined });
    renderTranslationMainPanel();
    focusAfterRerender("#correctionJudgment");
    triggerStampAnimation(document.getElementById("judgmentStamp"));
  });
  document.getElementById("correctionItemComment").addEventListener("input", (event) => {
    updateWorkspaceItemReview(item.id, { comment: event.target.value });
  });
  document.getElementById("correctionSuggestedRevision").addEventListener("input", (event) => {
    updateWorkspaceItemReview(item.id, { suggestedRevision: event.target.value });
  });
  document.getElementById("previousCorrectionItem").addEventListener("click", () => {
    studioAudio.playPageTurn();
    correctionItemIndex -= 1;
    renderTranslationMainPanel();
    triggerPageTurnAnimation(translationDocumentPanel, "prev");
  });
  document.getElementById("nextCorrectionItem").addEventListener("click", () => {
    studioAudio.playPageTurn();
    correctionItemIndex += 1;
    renderTranslationMainPanel();
    triggerPageTurnAnimation(translationDocumentPanel, "next");
  });
  document.getElementById("saveCorrectionReview").addEventListener("click", () => {
    studioAudio.playStampThud();
    triggerStampAnimation(document.getElementById("judgmentStamp"));
    saveCorrectionReview(response);
  });
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
  const focusSelector = styleType === "color" ? "#applyColorCorrection" : `[data-style="${styleType}"]`;
  applyWorkspaceCorrection(itemId, answerText, draft, focusSelector);
}

async function applyInsertCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const color = document.getElementById("correctionColorSelect").value;
  const text = await promptStudyDeskText({
    title: t("review.insert"),
    message: t("review.insertPrompt"),
    fallbackSelector: "#applyInsertCorrection",
  });
  if (!text) return;
  const draft = { operation: "insert", start, end: start, anchoredText: "", text };
  if (color) draft.color = color;
  applyWorkspaceCorrection(itemId, answerText, draft, "#applyInsertCorrection");
}

async function applyReplaceCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  const anchoredText = answerText.slice(start, end);
  const color = document.getElementById("correctionColorSelect").value;
  const text = await promptStudyDeskText({
    title: t("review.replace"),
    message: t("review.replacePrompt"),
    fallbackSelector: "#applyReplaceCorrection",
  });
  if (!text) return;
  const draft = { operation: "replace", start, end, anchoredText, text };
  if (color) draft.color = color;
  applyWorkspaceCorrection(itemId, answerText, draft, "#applyReplaceCorrection");
}

function applyDeleteCorrection(itemId, answerText) {
  const textarea = document.getElementById("correctionAnswerViewer");
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start === end) {
    showToast(t("toast.correctionSelectionRequired"));
    return;
  }
  applyWorkspaceCorrection(itemId, answerText, { operation: "delete", start, end, anchoredText: answerText.slice(start, end) }, "#applyDeleteCorrection");
}

function applyWorkspaceCorrection(itemId, answerText, draft, focusSelector) {
  try {
    const itemReview = getWorkspaceItemReview(itemId);
    const nextCorrections = addCorrection(itemReview.corrections, draft, answerText);
    updateWorkspaceItemReview(itemId, { corrections: nextCorrections });
    renderTranslationMainPanel();
    focusAfterRerender(focusSelector);
  } catch {
    showToast(t("toast.correctionConflict"));
  }
}

function removeWorkspaceCorrection(itemId, correctionId, focusSelector) {
  const itemReview = getWorkspaceItemReview(itemId);
  const nextCorrections = removeCorrection(itemReview.corrections, correctionId);
  updateWorkspaceItemReview(itemId, { corrections: nextCorrections });
  renderTranslationMainPanel();
  focusAfterRerender(focusSelector);
}

function saveCorrectionReview(response) {
  try {
    const next = upsertTeacherReview(loadTeacherReviews(), correctionReviewDraft, { learnerResponses: loadLearnerResponses() });
    saveJson(TEACHER_REVIEWS_KEY, next);
    correctionReviewDraft = findTeacherReviewForResponse(next, response.id);
    showToast(t("toast.correctionReviewSaved"));
    renderTranslationMainPanel();
  } catch {
    showToast(t("toast.correctionReviewSaveFail"));
  }
}

function exportCurrentReviewJson(response) {
  try {
    const portable = toPortableTeacherReview(correctionReviewDraft, { learnerResponse: response });
    downloadJson(portable, `teacher-review-${portable.id}.json`);
  } catch {
    showToast(t("toast.reviewExportFail"));
  }
}

function exportCurrentRemediationRequest(response) {
  try {
    const pkg = createRemediationRequestPackage({
      learnerResponse: response,
      teacherReview: correctionReviewDraft,
      task: t("review.remediationTaskInstruction"),
    });
    downloadJson(pkg, `remediation-request-${response.id}.json`);
  } catch {
    showToast(t("toast.remediationRequestExportFail"));
  }
}

function exportReviewRequest(responseId) {
  try {
    const response = findLearnerResponse(loadLearnerResponses(), responseId);
    if (!response) throw new Error("Learner Response not found");
    const pkg = createReviewRequestPackage({ learnerResponse: response, task: t("review.taskInstruction") });
    downloadJson(pkg, `review-request-${response.id}.json`);
  } catch {
    showToast(t("toast.reviewRequestExportFail"));
  }
}

function startTeacherReviewImport(responseId, event) {
  const file = event.target.files[0];
  if (!file) return;
  const response = findLearnerResponse(loadLearnerResponses(), responseId);
  const reader = new FileReader();
  reader.onload = () => {
    const { review, errors } = parseExternalTeacherReviewText(reader.result, { learnerResponse: response });
    const classification = review ? classifyTeacherReviewImport(review, loadTeacherReviews()) : null;
    const combinedErrors = classification?.kind === "reassigned-reject"
      ? [...errors, t("review.reassignedRejectError")]
      : errors;
    reviewImportDraft = { responseId, review, errors: combinedErrors, classification };
    renderTranslationMainPanel();
  };
  reader.onerror = () => showToast(t("toast.reviewImportFail"));
  reader.readAsText(file);
  event.target.value = "";
}

function renderReviewImportItemSummary(review) {
  return `
    <div class="review-list">
      ${review.itemReviews.map((item) => `
        <div class="review-item">
          <span class="meta-text">${escapeHtml(item.itemId)}</span>
          <span>${item.judgment ? `<span class="correction-op-pill">${escapeHtml(item.judgment)}</span>` : ""}</span>
          <span class="annotation-text">${escapeHtml(item.comment || item.suggestedRevision || "")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderReviewImportPreview() {
  const draft = reviewImportDraft;
  const response = findLearnerResponse(loadLearnerResponses(), draft.responseId);
  const review = draft.review;
  const classification = draft.classification;
  const canConfirm = Boolean(review) && classification?.kind !== "reassigned-reject";
  const itemCount = review?.itemReviews?.length || 0;
  const correctionCount = review ? review.itemReviews.reduce((sum, item) => sum + (item.corrections?.length || 0), 0) : 0;
  const remediationCount = review?.remediationRecommendations?.length || 0;
  const statusKey = !classification ? null : {
    new: "review.importStatusNew",
    idempotent: "review.importStatusIdempotent",
    update: "review.importStatusUpdate",
    "reassigned-reject": "review.importStatusReassignedReject",
  }[classification.kind];

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions"><span class="type-pill">${t("review.importPreviewTitle")}</span></div>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("review.targetResponse")}</span><strong>${escapeHtml(response?.material?.title || draft.responseId)}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("review.reviewId")}</span><strong>${escapeHtml(review?.id || "-")}</strong></div>
      </div>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("review.reviewer")}</span><strong>${escapeHtml(review ? reviewerLabel(review.reviewer) : "-")}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("review.importStatus")}</span><strong>${statusKey ? t(statusKey) : "-"}</strong></div>
      </div>
      ${review ? `
        <p class="meta-text">${t("review.reviewedItemCount", { count: itemCount })} &middot; ${t("review.correctionCount", { count: correctionCount })} &middot; ${t("review.remediationRecommendationCount", { count: remediationCount })}</p>
        ${renderReviewImportItemSummary(review)}
      ` : ""}
      ${draft.errors.length ? `
        <div class="import-errors">
          <strong>${t("translation.importErrors")}</strong>
          <ul>${draft.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="cancelReviewImport">${t("translation.importCancel")}</button>
        <button class="primary-button" type="button" id="confirmReviewImport" ${canConfirm ? "" : "disabled"}>${t("translation.importConfirm")}</button>
      </div>
    </div>
  `;

  document.getElementById("cancelReviewImport").addEventListener("click", () => {
    reviewImportDraft = null;
    renderTranslationView();
  });
  document.getElementById("confirmReviewImport").addEventListener("click", confirmReviewImport);
}

function confirmReviewImport() {
  const draft = reviewImportDraft;
  try {
    const response = findLearnerResponse(loadLearnerResponses(), draft.responseId);
    const next = upsertTeacherReview(loadTeacherReviews(), draft.review, { learnerResponse: response });
    saveJson(TEACHER_REVIEWS_KEY, next);
    reviewImportDraft = null;
    showToast(t("toast.reviewImportSuccess"));
    renderTranslationView();
  } catch {
    showToast(t("toast.reviewImportFail"));
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

async function deleteTranslationItem(documentId, itemId) {
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message: t("translation.deleteItemConfirm"),
    tone: "danger",
    fallbackSelector: "#addTranslationItem",
  })) return;
  saveTranslationLibrary(removeTranslationItem(translationLibrary, documentId, itemId));
  renderTranslationMainPanel();
  showToast(t("toast.translationItemDeleted"));
}

function addTranslationItemToDocument(documentId) {
  const next = addTranslationItem(translationLibrary, documentId, { sourceText: t("translation.newItemPlaceholder") });
  saveTranslationLibrary(next);
  renderTranslationMainPanel();
}

async function deleteTranslationDocumentConfirm(documentId) {
  const analysis = analyzeTranslationDocumentDeletion(documentId, { learnerResponses: loadLearnerResponses() });
  const message = analysis.hasDependents
    ? t("translation.deleteDocumentConfirmWithResponses", { count: analysis.dependentResponseIds.length })
    : t("translation.deleteDocumentConfirm");
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message,
    tone: "danger",
    fallbackSelector: "#newTranslationFolder",
  })) return;
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

function renderRemediationImportPreview() {
  const draft = remediationImportDraft;
  const folder = translationLibrary.folders.find((item) => item.id === draft.folderId);
  const collision = draft.document ? findDocumentIdCollision(translationLibrary, draft.document.id) : false;
  const provenance = draft.document?.provenance;
  const sourceResponse = provenance?.sourceResponseId ? findLearnerResponse(loadLearnerResponses(), provenance.sourceResponseId) : null;
  const sourceReview = provenance?.sourceReviewId
    ? loadTeacherReviews().find((item) => item.id === provenance.sourceReviewId)
    : null;
  const items = draft.document?.items || [];
  const allErrors = [
    ...draft.errors,
    ...(folder ? [] : [t("translation.importNeedFolder")]),
    ...(collision && !draft.allowCopy ? [t("translation.importCollision")] : []),
  ];
  const canConfirm = allErrors.length === 0 && draft.document;

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions"><span class="type-pill">${t("review.importRemediationMaterial")}</span></div>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("translation.documentTitleLabel")}</span><strong>${escapeHtml(draft.document?.title || "-")}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("translation.importTargetFolder")}</span><strong>${escapeHtml(folder?.name || "-")}</strong></div>
      </div>
      <p class="meta-text">${t("translation.itemCount", { count: items.length })}</p>
      <div class="field-grid">
        <div class="preview-field"><span class="meta-text">${t("review.sourceResponse")}</span><strong>${escapeHtml(sourceResponse?.material?.title || provenance?.sourceResponseId || "-")}</strong></div>
        <div class="preview-field"><span class="meta-text">${t("review.sourceReview")}</span><strong>${escapeHtml(sourceReview ? reviewerLabel(sourceReview.reviewer) : (provenance?.sourceReviewId || "-"))}</strong></div>
      </div>
      ${collision ? `
        <label class="inline-check">
          <span>${t("translation.importAsCopy")}</span>
          <input type="checkbox" id="remediationAllowCopy" ${draft.allowCopy ? "checked" : ""}>
        </label>
      ` : ""}
      ${allErrors.length ? `
        <div class="import-errors">
          <strong>${t("translation.importErrors")}</strong>
          <ul>${allErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="cancelRemediationImport">${t("translation.importCancel")}</button>
        <button class="primary-button" type="button" id="confirmRemediationImport" ${canConfirm ? "" : "disabled"}>${t("translation.importConfirm")}</button>
      </div>
    </div>
  `;

  document.getElementById("cancelRemediationImport").addEventListener("click", () => {
    remediationImportDraft = null;
    renderTranslationView();
  });
  if (collision) {
    document.getElementById("remediationAllowCopy").addEventListener("change", (event) => {
      remediationImportDraft.allowCopy = event.target.checked;
      renderRemediationImportPreview();
    });
  }
  document.getElementById("confirmRemediationImport").addEventListener("click", confirmRemediationImport);
}

function confirmRemediationImport() {
  const draft = remediationImportDraft;
  try {
    const collision = findDocumentIdCollision(translationLibrary, draft.document.id);
    const nextDocument = collision ? remapDocumentForCopy(draft.document) : draft.document;
    const next = createTranslationDocument(translationLibrary, { ...nextDocument, folderId: draft.folderId });
    selectedTranslationDocumentId = next.documents[next.documents.length - 1].id;
    remediationImportDraft = null;
    saveTranslationLibrary(next);
    renderTranslationView();
    showToast(t("toast.remediationImportSuccess"));
  } catch {
    showToast(t("toast.remediationImportFail"));
  }
}

function openTranslationHistory() {
  translationHistoryOpen = true;
  translationHistoryDetailId = null;
  retrySelectionDraft = null;
  correctionWorkspaceResponseId = null;
  correctionReviewDraft = null;
  translationPracticeActive = false;
  translationImportDraft = null;
  reviewImportDraft = null;
  remediationImportDraft = null;
  renderTranslationView();
}

function closeTranslationHistory() {
  translationHistoryOpen = false;
  translationHistoryDetailId = null;
  retrySelectionDraft = null;
  renderTranslationView();
}

function openHistoryDetail(responseId) {
  translationHistoryDetailId = responseId;
  retrySelectionDraft = null;
  renderTranslationMainPanel();
}

function renderHistoryBrowser() {
  const entries = filterHistoryEntries(buildHistoryIndex(loadLearnerResponses(), loadTeacherReviews()), translationHistoryFilters);

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${t("history.title")}</span>
        <div class="row-actions">
          <button class="secondary-button small-button" type="button" id="closeTranslationHistory">${t("review.back")}</button>
        </div>
      </div>
      <div class="field-grid">
        <label><span>${t("history.filterPurpose")}</span>
          <select id="historyFilterPurpose">
            <option value="all" ${translationHistoryFilters.purpose === "all" ? "selected" : ""}>${t("history.purposeAll")}</option>
            <option value="practice" ${translationHistoryFilters.purpose === "practice" ? "selected" : ""}>${t("history.purposePractice")}</option>
            <option value="retry" ${translationHistoryFilters.purpose === "retry" ? "selected" : ""}>${t("history.purposeRetry")}</option>
            <option value="remediation" ${translationHistoryFilters.purpose === "remediation" ? "selected" : ""}>${t("history.purposeRemediation")}</option>
          </select>
        </label>
        <label><span>${t("history.filterStatus")}</span>
          <select id="historyFilterStatus">
            <option value="all" ${translationHistoryFilters.status === "all" ? "selected" : ""}>${t("history.statusAll")}</option>
            <option value="unreviewed" ${translationHistoryFilters.status === "unreviewed" ? "selected" : ""}>${t("history.statusUnreviewed")}</option>
            <option value="reviewed" ${translationHistoryFilters.status === "reviewed" ? "selected" : ""}>${t("history.statusReviewed")}</option>
            <option value="needs-work" ${translationHistoryFilters.status === "needs-work" ? "selected" : ""}>${t("history.statusNeedsWork")}</option>
          </select>
        </label>
        <label><span>${t("history.sort")}</span>
          <select id="historyFilterSort">
            <option value="newest" ${translationHistoryFilters.sort === "newest" ? "selected" : ""}>${t("history.sortNewest")}</option>
            <option value="oldest" ${translationHistoryFilters.sort === "oldest" ? "selected" : ""}>${t("history.sortOldest")}</option>
          </select>
        </label>
      </div>
      <div class="review-list">
        ${entries.length ? entries.map(renderHistoryEntryRow).join("") : `<div class="library-empty">${t("history.empty")}</div>`}
      </div>
    </div>
  `;

  document.getElementById("closeTranslationHistory").addEventListener("click", closeTranslationHistory);
  document.getElementById("historyFilterPurpose").addEventListener("change", (event) => {
    translationHistoryFilters = { ...translationHistoryFilters, purpose: event.target.value };
    renderTranslationMainPanel();
    focusAfterRerender("#historyFilterPurpose");
  });
  document.getElementById("historyFilterStatus").addEventListener("change", (event) => {
    translationHistoryFilters = { ...translationHistoryFilters, status: event.target.value };
    renderTranslationMainPanel();
    focusAfterRerender("#historyFilterStatus");
  });
  document.getElementById("historyFilterSort").addEventListener("change", (event) => {
    translationHistoryFilters = { ...translationHistoryFilters, sort: event.target.value };
    renderTranslationMainPanel();
    focusAfterRerender("#historyFilterSort");
  });
  document.querySelectorAll("[data-open-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryDetail(button.dataset.openHistoryDetail));
  });
}

const HISTORY_STATUS_LABEL_KEYS = {
  unreviewed: "unreviewed",
  reviewed: "reviewed",
  "multiple-reviews": "multipleReviews",
};

function renderHistoryEntryRow(entry) {
  const status = deriveEntryStatus(entry);
  const badges = [
    `<span class="type-pill">${t(`history.purposeLabel.${entry.purpose}`)}</span>`,
    `<span class="type-pill">${t(`history.statusLabel.${HISTORY_STATUS_LABEL_KEYS[status]}`)}</span>`,
    entry.needsWorkCount ? `<span class="type-pill">${t("history.needsWorkBadge", { count: entry.needsWorkCount })}</span>` : "",
    entry.hasRemediationChild ? `<span class="type-pill">${t("history.hasRemediationBadge")}</span>` : "",
    entry.hasRetryChild ? `<span class="type-pill">${t("history.hasRetryBadge")}</span>` : "",
  ].filter(Boolean).join(" ");
  return `
    <div class="review-item">
      <div>
        <strong>${escapeHtml(entry.materialTitle || t("library.untitled"))}</strong>
        <div class="meta-text">${escapeHtml(entry.sourceLanguage)} &rarr; ${escapeHtml(entry.targetLanguage)} &middot; ${formatDate(entry.completedAt)} &middot; ${t("translation.itemCount", { count: entry.itemCount })}</div>
        <div class="badge-row">${badges}</div>
      </div>
      <div class="row-actions">
        <button class="small-button" type="button" data-open-history-detail="${entry.responseId}">${t("history.open")}</button>
      </div>
    </div>
  `;
}

function renderHistoryDetail(responseId) {
  const response = findLearnerResponse(loadLearnerResponses(), responseId);
  if (!response) {
    translationHistoryDetailId = null;
    showToast(t("toast.historyResponseNotFound"));
    renderTranslationMainPanel();
    return;
  }

  if (retrySelectionDraft?.responseId === responseId) {
    renderRetrySelection(response);
    return;
  }

  const allResponses = loadLearnerResponses();
  const allReviews = loadTeacherReviews();
  const reviews = findTeacherReviewsForResponse(allReviews, responseId);
  const lineage = resolveResponseLineage(response, { learnerResponses: allResponses, teacherReviews: allReviews });
  const needsWork = deriveNeedsWorkItemIds(response, allReviews);
  const needsWorkIds = new Set(needsWork.map((item) => item.itemId));

  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions">
        <span class="type-pill">${escapeHtml(response.material.snapshot.sourceLanguage || "")} &rarr; ${escapeHtml(response.material.snapshot.targetLanguage || "")}</span>
        <div class="row-actions">
          <button class="secondary-button small-button" type="button" id="backToHistoryBrowser">${t("history.backToList")}</button>
        </div>
      </div>
      <div class="quiz-title-block">
        <h2>${escapeHtml(response.material.title || t("library.untitled"))}</h2>
        <p class="meta-text">${t(`history.purposeLabel.${response.provenance?.purpose || "practice"}`)} &middot; ${t("history.started")}: ${formatDate(response.session.startedAt)} &middot; ${t("history.completed")}: ${formatDate(response.finalizedAt)}</p>
      </div>

      ${lineage.ancestors.length ? `
        <div class="library-heading"><strong>${t("history.lineageTitle")}</strong></div>
        <div class="review-list">${lineage.ancestors.map(renderLineageAncestorRow).join("")}</div>
      ` : ""}
      ${lineage.descendants.length ? `
        <div class="library-heading"><strong>${t("history.derivedInto")}</strong></div>
        <div class="review-list">${lineage.descendants.map(renderLineageDescendantRow).join("")}</div>
      ` : ""}

      <div class="library-heading"><strong>${t("history.itemsSection")}</strong></div>
      <div class="review-list">
        ${response.material.snapshot.items.map((item) => renderHistoryItemRow(item, response, needsWorkIds)).join("")}
      </div>

      <div class="library-heading"><strong>${t("review.availableReviews")}</strong><span>${reviews.length}</span></div>
      <div class="review-list">
        ${reviews.length ? reviews.map(renderHistoryReviewRow).join("") : `<p class="meta-text">${t("review.noCorrections")}</p>`}
      </div>

      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="historyRetryEntire">${t("history.retryEntire")}</button>
        <button class="secondary-button" type="button" id="historyRetrySelected">${t("history.retrySelected")}</button>
        <button class="secondary-button" type="button" id="historyRetryNeedsWork" ${needsWork.length ? "" : "disabled"}>${t("history.retryNeedsWork")}</button>
        <button class="secondary-button" type="button" id="historyOpenReview">${t("review.openWorkspace")}</button>
        <button class="secondary-button" type="button" id="historyExportResponse">${t("actions.exportResponse")}</button>
        <button class="secondary-button" type="button" id="historyExportReviewRequest">${t("review.exportReviewRequest")}</button>
        <button class="danger-button secondary-button" type="button" id="historyDeleteResponse">${t("history.deleteResponse")}</button>
      </div>
    </div>
  `;

  document.getElementById("backToHistoryBrowser").addEventListener("click", () => {
    translationHistoryDetailId = null;
    renderTranslationMainPanel();
  });
  document.getElementById("historyRetryEntire").addEventListener("click", () => startRetryPractice(responseId));
  document.getElementById("historyRetrySelected").addEventListener("click", () => {
    retrySelectionDraft = { responseId, selectedItemIds: response.material.snapshot.items.map((item) => item.id) };
    renderTranslationMainPanel();
  });
  document.getElementById("historyRetryNeedsWork").addEventListener("click", () => startRetryNeedsWork(response));
  document.getElementById("historyOpenReview").addEventListener("click", () => {
    translationHistoryOpen = false;
    translationHistoryDetailId = null;
    openCorrectionWorkspace(responseId);
  });
  document.getElementById("historyExportResponse").addEventListener("click", () => exportLearnerResponse(responseId));
  document.getElementById("historyExportReviewRequest").addEventListener("click", () => exportReviewRequest(responseId));
  document.getElementById("historyDeleteResponse").addEventListener("click", () => deleteLearnerResponseConfirm(responseId));
  document.querySelectorAll("[data-open-history-detail]").forEach((button) => {
    button.addEventListener("click", () => openHistoryDetail(button.dataset.openHistoryDetail));
  });
  document.querySelectorAll("[data-open-history-review]").forEach((button) => {
    button.addEventListener("click", () => {
      translationHistoryOpen = false;
      translationHistoryDetailId = null;
      correctionWorkspaceResponseId = responseId;
      correctionReviewDraft = reviews.find((review) => review.id === button.dataset.openHistoryReview) || null;
      correctionItemIndex = 0;
      renderTranslationMainPanel();
    });
  });
  document.querySelectorAll("[data-delete-history-review]").forEach((button) => {
    button.addEventListener("click", () => deleteTeacherReviewConfirm(button.dataset.deleteHistoryReview));
  });
}

function renderLineageAncestorRow(node) {
  const sourceLabel = node.sourceResponseAvailable
    ? escapeHtml(node.sourceResponseTitle || node.sourceResponseId)
    : `${t("history.originalMaterialUnavailable")} (${escapeHtml(node.sourceResponseId)})`;
  const reviewPart = node.sourceReviewId
    ? ` &middot; ${t("review.sourceReview")}: ${node.sourceReviewAvailable ? escapeHtml(reviewerLabel(node.sourceReviewer)) : `${t("history.originalMaterialUnavailable")} (${escapeHtml(node.sourceReviewId)})`}`
    : "";
  return `
    <div class="review-item">
      <span class="meta-text">${t(`history.purposeLabel.${node.purpose || "practice"}`)} &larr; ${t("review.sourceResponse")}: ${sourceLabel}${reviewPart}</span>
      ${node.sourceResponseAvailable ? `<button class="small-button" type="button" data-open-history-detail="${node.sourceResponseId}">${t("history.open")}</button>` : ""}
    </div>
  `;
}

function renderLineageDescendantRow(node) {
  return `
    <div class="review-item">
      <span class="meta-text">${t(`history.purposeLabel.${node.purpose || "practice"}`)} &rarr; ${escapeHtml(node.materialTitle || node.responseId)} &middot; ${formatDate(node.completedAt)}</span>
      <button class="small-button" type="button" data-open-history-detail="${node.responseId}">${t("history.open")}</button>
    </div>
  `;
}

function renderHistoryItemRow(item, response, needsWorkIds) {
  const answerEntry = response.responses.find((entry) => entry.itemId === item.id);
  const answerText = typeof answerEntry?.answer === "string" ? answerEntry.answer : "";
  const annotations = (response.learnerAnnotations || []).filter((annotation) => annotation.itemId === item.id);
  return `
    <div class="review-item">
      <div>
        <strong>${escapeHtml(item.sourceText)}</strong>
        <div class="answer-compare">
          <p><strong>${t("translationPractice.yourTranslation")}:</strong> ${escapeHtml(answerText || t("result.noAnswer"))}</p>
          ${item.referenceTranslation ? `<p><strong>${t("translationPractice.referenceLabel")}:</strong> ${escapeHtml(item.referenceTranslation)}</p>` : ""}
        </div>
        ${annotations.length ? `<div class="annotation-list">${annotations.map(renderAnnotationRowReadOnly).join("")}</div>` : ""}
        ${needsWorkIds.has(item.id) ? `<span class="type-pill">${t("history.needsWorkFlag")}</span>` : ""}
      </div>
    </div>
  `;
}

function renderHistoryReviewRow(review) {
  const correctionCount = (review.itemReviews || []).reduce((sum, item) => sum + (item.corrections?.length || 0), 0);
  return `
    <div class="review-item">
      <span class="meta-text">${escapeHtml(reviewerLabel(review.reviewer))} &middot; ${escapeHtml(review.id)} &middot; ${formatDate(review.createdAt)} &middot; ${t("review.correctionCount", { count: correctionCount })}</span>
      <div class="row-actions">
        <button class="small-button" type="button" data-open-history-review="${review.id}">${t("review.openReview")}</button>
        <button class="danger-button small-button" type="button" data-delete-history-review="${review.id}">${t("review.deleteReview")}</button>
      </div>
    </div>
  `;
}

function renderRetrySelection(response) {
  const draft = retrySelectionDraft;
  translationDocumentPanel.innerHTML = `
    <div class="editor-stack">
      <div class="editor-actions"><span class="type-pill">${t("history.retrySelectTitle")}</span></div>
      <p class="meta-text">${t("history.retrySelectHint")}</p>
      <div class="review-list">
        ${response.material.snapshot.items.map((item) => `
          <label class="inline-check">
            <span>${escapeHtml(item.sourceText)}</span>
            <input type="checkbox" data-retry-item="${item.id}" ${draft.selectedItemIds.includes(item.id) ? "checked" : ""}>
          </label>
        `).join("")}
      </div>
      <div class="quiz-actions">
        <button class="secondary-button" type="button" id="cancelRetrySelection">${t("translation.importCancel")}</button>
        <button class="primary-button" type="button" id="confirmRetrySelection" ${draft.selectedItemIds.length ? "" : "disabled"}>${t("history.retryStart")}</button>
      </div>
    </div>
  `;

  document.querySelectorAll("[data-retry-item]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const itemId = input.dataset.retryItem;
      const nextIds = event.target.checked
        ? [...retrySelectionDraft.selectedItemIds, itemId]
        : retrySelectionDraft.selectedItemIds.filter((id) => id !== itemId);
      retrySelectionDraft = { ...retrySelectionDraft, selectedItemIds: nextIds };
      renderTranslationMainPanel();
      focusAfterRerender(`[data-retry-item="${itemId}"]`);
    });
  });
  document.getElementById("cancelRetrySelection").addEventListener("click", () => {
    retrySelectionDraft = null;
    renderTranslationMainPanel();
  });
  document.getElementById("confirmRetrySelection").addEventListener("click", () => {
    startRetryPractice(response.id, { itemIds: retrySelectionDraft.selectedItemIds });
  });
}

async function startRetryPractice(responseId, options = {}) {
  const response = findLearnerResponse(loadLearnerResponses(), responseId);
  if (!response) {
    showToast(t("toast.historyResponseNotFound"));
    return;
  }
  let material;
  try {
    material = buildRetryMaterial({ response, itemIds: options.itemIds, sourceReviewId: options.sourceReviewId });
  } catch {
    showToast(t("toast.retryFail"));
    return;
  }
  if (translationSession && !translationSession.completed) {
    if (!await confirmStudyDeskAction({
      title: t("dialog.progressTitle"),
      message: t("translationPractice.overwriteConfirm"),
      confirmLabel: t("dialog.continue"),
      tone: "danger",
      fallbackSelector: "#historyRetryEntire, #confirmRetrySelection",
    })) return;
  }
  translationSession = createTranslationSession({ document: material });
  translationPracticeActive = true;
  translationHistoryOpen = false;
  translationHistoryDetailId = null;
  retrySelectionDraft = null;
  persistTranslationSession();
  renderTranslationView();
  showToast(t("toast.retryStarted"));
}

function startRetryNeedsWork(response) {
  const needsWork = deriveNeedsWorkItemIds(response, loadTeacherReviews());
  if (!needsWork.length) {
    showToast(t("toast.retryNeedsWorkNone"));
    return;
  }
  if (!window.confirm(t("history.needsWorkConfirm", { count: needsWork.length }))) return;
  startRetryPractice(response.id, { itemIds: needsWork.map((item) => item.itemId) });
}

async function deleteLearnerResponseConfirm(responseId) {
  // Snapshot both collections up front: loadTeacherReviews() re-validates every review against the
  // current Learner Response collection, so it must never be called again after the response has
  // already been removed (it would see the now-dangling reviews as orphans and throw). Computing
  // both next collections from these snapshots first, then writing them, avoids that hazard.
  const learnerResponses = loadLearnerResponses();
  const teacherReviews = loadTeacherReviews();
  const analysis = analyzeLearnerResponseDeletion(responseId, { teacherReviews, learnerResponses, translationDocuments: translationLibrary.documents });
  if (analysis.hasBlockingDependents) {
    showToast(t("toast.deleteResponseBlockedByRemediation", { count: analysis.dependentRemediationDocumentIds.length }));
    return;
  }
  const message = analysis.hasDependents
    ? t("history.deleteResponseCascadeConfirm", { reviewCount: analysis.dependentReviewIds.length, derivedCount: analysis.dependentResponseIds.length })
    : t("history.deleteResponseConfirm");
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message,
    tone: "danger",
    fallbackSelector: "#closeTranslationHistory",
  })) return;
  const nextReviews = removeTeacherReviewsForResponse(teacherReviews, responseId);
  const nextResponses = removeLearnerResponse(learnerResponses, responseId);
  saveJson(TEACHER_REVIEWS_KEY, nextReviews);
  saveJson(LEARNER_RESPONSES_KEY, nextResponses);
  translationHistoryDetailId = null;
  if (correctionWorkspaceResponseId === responseId) correctionWorkspaceResponseId = null;
  renderTranslationMainPanel();
  showToast(t("toast.responseDeleted"));
}

async function deleteTeacherReviewConfirm(reviewId) {
  const analysis = analyzeTeacherReviewDeletion(reviewId, { learnerResponses: loadLearnerResponses(), translationDocuments: translationLibrary.documents });
  if (analysis.hasBlockingDependents) {
    showToast(t("toast.deleteReviewBlockedByRemediation", { count: analysis.dependentRemediationDocumentIds.length }));
    return;
  }
  const message = analysis.hasDependents
    ? t("history.deleteReviewLineageConfirm", { count: analysis.dependentResponseIds.length })
    : t("review.deleteReviewConfirm");
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message,
    tone: "danger",
    fallbackSelector: "#historyOpenReview, #backToHistoryBrowser",
  })) return;
  saveJson(TEACHER_REVIEWS_KEY, removeTeacherReview(loadTeacherReviews(), reviewId));
  if (correctionReviewDraft?.id === reviewId) correctionReviewDraft = null;
  renderTranslationMainPanel();
  showToast(t("toast.reviewDeleted"));
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
  if (saved?.paperId === activePaperId && !saved.completed) {
    if (!saved.feedbackMode || (saved.feedbackMode !== "instant" && saved.feedbackMode !== "submitAtEnd")) {
      saved.feedbackMode = "instant";
    }
    return saved;
  }
  return null;
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

async function clearPaperHistory() {
  if (!await confirmStudyDeskAction({
    title: t("dialog.destructiveTitle"),
    message: t("practice.clearHistoryConfirm"),
    tone: "danger",
    fallbackSelector: "#startQuiz",
  })) return;
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
  uiPreferences.theme = next;
  saveUiPreferences(uiPreferences);
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
  if (!shouldRegisterProductionServiceWorker(window.location)) return;

  const hasController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasController && !refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is optional; the app remains usable without it.
    });
  });
}
