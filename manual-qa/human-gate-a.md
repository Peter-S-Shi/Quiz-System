# Human Gate A Verification Guide — Practice Feedback Modes & Special Practice IA

**Scope**: Pre-Freeze V1 Scope Closure · Batch A  
**Status**: Ready for Human Evaluation (DO NOT mark PASS autonomously)  
**Evaluator**: Human Reviewer / User  

---

## Overview

This guide provides step-by-step verification journeys for the two capabilities introduced in Pre-Freeze V1 Scope Closure Batch A:
1. **Objective Quiz Practice Feedback Modes**: Instant Feedback (`instant`) vs. Submit at End (`submitAtEnd`).
2. **Special Practice Information Architecture**: Reorganizing Translation under the new top-level `Special Practice` container.

---

## Verification Journey A: Instant Feedback Mode

### Objective
Verify that the default Objective Quiz practice mode preserves question-by-question immediate grading, ink feedback, and disabled inputs upon submission.

### Steps
1. Launch Quiz Studio (`start-local.bat` or `python scripts/dev-server.py`).
2. From the Home Launcher or topbar, enter **Quiz** (做题).
3. In **Practice Setup** (练习设置), confirm that **Instant Feedback** (即时反馈) is selected by default under Practice Feedback Mode (答题反馈模式).
4. Click **Start Quiz** (开始做题).
5. For Question 1, select/enter an answer and click **Submit Answer** (提交答案):
   - Verify that stamp audio plays (if sound is enabled).
   - Verify that immediate ink feedback (correct/wrong) and explanation appear.
   - Verify that answer inputs become disabled.
   - Verify that the primary action button changes to **Next Question** (下一题) or **View Results** (查看结果).
6. Refresh the browser on Question 2:
   - Return to Quiz and click **Resume Progress** (继续上次进度).
   - Verify that the previous question results and feedback remain intact and the session is restored in Instant Feedback mode.
7. Complete all questions and view the Results screen. Verify that score, percent, and review items display accurately.

---

## Verification Journey B: Submit at End Mode (Exam Workflow)

### Objective
Verify that the new `Submit at End` practice mode allows learners to answer questions without premature feedback leakage, freely navigate back and forth to modify answers, and submit the entire paper at once for grading.

### Steps
1. In **Quiz** (做题) -> **Practice Setup** (练习设置), select **Submit at End** (答题交卷).
2. Click **Start Quiz** (开始做题).
3. On Question 1:
   - Select an answer.
   - Verify that NO feedback, correctness indicator, or answer explanation is shown.
   - Verify that answer inputs remain enabled.
   - Verify that the primary action button is **Next Question** (下一题).
4. Click **Next Question** (下一题) to go to Question 2:
   - Select an answer for Question 2.
5. Click **Previous** (上一题) to return to Question 1:
   - Verify that the answer selected in Step 3 is preserved.
   - Change the answer to a different option.
   - Verify that changing the answer works seamlessly and no feedback is leaked.
6. Refresh the browser while on Question 2:
   - Click **Resume Progress** (继续上次进度).
   - Verify that the session resumes in `Submit at End` mode with all answers preserved and zero feedback displayed.
7. Test Final Submit Confirmation & Cancel Safety:
   - Navigate to the last question while leaving at least one question unanswered:
     - Click **Submit Paper** (提交试卷).
     - Verify that a confirmation dialog appears stating the count of unanswered questions and warning that answers can no longer be changed after submission.
     - Click **Cancel** on the dialog.
     - Verify that the active session remains completely untouched: no grading performed, no results leaked, answers preserved, session not finalized.
   - Navigate to the unanswered question(s) and complete all answers.
   - Return to the last question and click **Submit Paper** (提交试卷):
     - Verify that a confirmation dialog appears confirming that submission will finalize grading and answers cannot be changed.
     - Confirm submission (click **OK**).
     - Verify that stamp audio plays, all questions are graded, score is computed, Learner Response is finalized, and the comprehensive Results screen is displayed.
8. Verify that **Export Response** (导出作答记录) produces a valid JSON Learner Response containing all graded items.

---

## Verification Journey C: Special Practice Product Hierarchy

### Objective
Verify the new product hierarchy where Translation resides under the top-level **Special Practice** (专项练习) container, while existing Translation workflows remain fully functional.

### Steps
1. Observe the topbar navigation tabs:
   - Verify that the tabs are **Home** (首页), **Edit** (编辑), **Quiz** (做题), and **Special Practice** (专项练习).
   - Verify that "Translation" no longer appears as a parallel top-level tab.
2. From Home Launcher, click the **Special Practice** (专项进阶练习) card:
   - Verify that you are taken to the **Special Practice Workspace** (专项练习工作台).
   - Verify that the Translation Studio (双语翻译研习) card is displayed.
3. Click the Translation card:
   - Verify that the Translation workspace opens with its full library, documents, items, and import tools intact.
   - Verify that the topbar tab **Special Practice** remains highlighted as active.
   - Verify that a **&larr; Back to Special Practice** (&larr; 返回专项练习) button is present at the top of the Translation library panel.
4. Click **&larr; Back to Special Practice**:
   - Verify that you return to the Special Practice Hub.
5. In Translation:
   - Test Document selection, Translation Practice, Annotation marking, History browsing, Review viewing, and Retry workflows.
   - Verify that all Translation capabilities function without any regression.
6. Switch language between English and 中文:
   - Verify that all Special Practice and Practice Feedback Mode strings are properly localized.

---

## Verdict & Sign-Off

- **Journey A (Instant Feedback)**: [ ] PASS / [ ] FAIL  
- **Journey B (Submit at End)**: [ ] PASS / [ ] FAIL  
- **Journey C (Product Hierarchy)**: [ ] PASS / [ ] FAIL  

**Human Reviewer Notes**:
```
[Enter observations, feedback, or issues here]
```
