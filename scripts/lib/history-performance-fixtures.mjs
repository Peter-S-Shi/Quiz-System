export function createHistoryPerformanceDataset(responseCount) {
  const learnerResponses = [];
  const teacherReviews = [];

  for (let index = 0; index < responseCount; index += 1) {
    const responseId = `perf-response-${String(index).padStart(5, "0")}`;
    const items = Array.from({ length: 10 }, (_, itemIndex) => ({
      id: `${responseId}-item-${itemIndex}`,
      sourceText: `Synthetic source ${index}-${itemIndex}`,
      referenceTranslation: `Synthetic reference ${index}-${itemIndex}`,
    }));
    const provenance = createProvenance(index);
    const completedAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    const response = {
      id: responseId,
      documentType: "quiz-studio.learner-response",
      finalizedAt: completedAt,
      material: {
        type: "translation-document",
        id: `perf-material-${String(index).padStart(5, "0")}`,
        title: `Synthetic History ${index}`,
        snapshot: {
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
          items,
        },
      },
      session: {
        id: `perf-session-${index}`,
        startedAt: new Date(Date.UTC(2026, 0, 1, 0, index - 1)).toISOString(),
        completedAt,
      },
      responses: items.map((item) => ({ itemId: item.id, answer: `Synthetic answer ${item.id}` })),
      summary: { itemCount: items.length },
      learnerAnnotations: [{
        id: `annotation-${index}`,
        itemId: items[0].id,
        kind: "uncertain",
        start: 0,
        end: 9,
        text: "Synthetic",
      }],
      learnerItemMarks: [{ itemId: items[1].id, kind: index % 2 ? "unknown" : "should_know" }],
      provenance,
    };
    learnerResponses.push(response);

    const reviewCount = index % 3;
    for (let reviewIndex = 0; reviewIndex < reviewCount; reviewIndex += 1) {
      teacherReviews.push({
        id: `perf-review-${index}-${reviewIndex}`,
        responseId,
        reviewer: { type: "human", name: `Synthetic Reviewer ${reviewIndex}` },
        createdAt: completedAt,
        itemReviews: [{
          itemId: items[2 + reviewIndex].id,
          judgment: reviewIndex === 0 ? "incorrect" : "partial",
          corrections: reviewIndex === 0 ? [{
            id: `correction-${index}`,
            operation: "replace",
            start: 0,
            end: 9,
            anchoredText: "Synthetic",
            text: "Example",
          }] : [],
        }],
      });
    }
  }

  return { learnerResponses, teacherReviews };
}

function createProvenance(index) {
  if (index > 0 && index % 10 === 1) {
    return {
      purpose: "retry",
      sourceResponseId: `perf-response-${String(index - 1).padStart(5, "0")}`,
      sourceMaterialId: `perf-material-${String(index - 1).padStart(5, "0")}`,
    };
  }
  if (index > 1 && index % 10 === 2) {
    return {
      purpose: "remediation",
      sourceResponseId: `perf-response-${String(index - 2).padStart(5, "0")}`,
      sourceReviewId: `perf-review-${index - 2}-0`,
      sourceMaterialId: `perf-material-${String(index - 2).padStart(5, "0")}`,
    };
  }
  return { purpose: "practice" };
}
