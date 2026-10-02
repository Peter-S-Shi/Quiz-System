"""Read-only summary of the spike store (no writes): schema, counts, hash over (id, payload text), v2 column probe."""
import hashlib
import json
import os
import sqlite3
import sys

root = sys.argv[1]
path = os.path.join(root, "data", "quiz-studio.db")
uri = "file:" + path.replace("\\", "/").replace(" ", "%20") + "?mode=ro"
c = sqlite3.connect(uri, uri=True)
out = {"fileBytes": os.path.getsize(path), "userVersion": c.execute("PRAGMA user_version").fetchone()[0], "applicationId": c.execute("PRAGMA application_id").fetchone()[0]}
h = hashlib.sha256()
n = 0
for t, pk in [("learner_response", "id"), ("teacher_review", "id")]:
    for row in c.execute(f"SELECT {pk}, payload FROM {t} ORDER BY {pk}"):
        h.update((t + "\x1f" + row[0] + "\x1f" + row[1] + "\n").encode("utf-8"))
        n += 1
out["records"] = n
out["payloadSha256"] = h.hexdigest()
cols = [r[1] for r in c.execute("PRAGMA table_info(learner_response)")]
out["hasSummaryLenColumn"] = "summary_len" in cols
if out["hasSummaryLenColumn"]:
    out["summaryLenNull"] = c.execute("SELECT count(*) FROM learner_response WHERE summary_len IS NULL").fetchone()[0]
    out["summaryLenNegative"] = c.execute("SELECT count(*) FROM learner_response WHERE summary_len < 0").fetchone()[0]
out["quickCheck"] = c.execute("PRAGMA quick_check").fetchone()[0]
print(json.dumps(out))
