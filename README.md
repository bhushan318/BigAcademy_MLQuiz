# Interactive ML Question Bank

A **static** quiz web app (HTML, CSS, JavaScript) that loads questions from `questions.json`. No backend required — ideal for **GitHub Pages**.

## Features

- Topic, difficulty, and text **search** filters before you start  
- One question at a time with **Previous** / **Next**  
- **Check answer** reveals correctness and **explanation**  
- **Progress bar**, live **score**, optional **count-up timer**  
- **Results** page with correct/wrong counts, time, and **expandable review**  
- **Dark mode** (persisted), **mobile-friendly** layout, light motion/animations  

## Project structure

```
quiz-app/
├── index.html      # Home — filters + Start quiz
├── quiz.html       # Quiz session
├── result.html     # Score + review
├── styles.css
├── script.js
├── questions.json  # Question bank (generated — see below)
├── build_questions_from_bank.py  # Builds questions.json from Exam_Combined_Master_Bank.md
└── README.md
```

### Full bank from your markdown exam file

If you keep **`Assesement/Marksdown/Exam_Combined_Master_Bank.md`** in sync with this repo layout, regenerate the app data with:

```bash
cd quiz-app
python build_questions_from_bank.py
```

That writes **`questions.json`** with **200 items** aligned to the four exam sections:

| Section | Topic filter in the app                         | Quiz behaviour                                      |
|---------|--------------------------------------------------|-----------------------------------------------------|
| **A**   | Section A — Multiple choice                      | 4-option MCQ, auto-scored                           |
| **B**   | Section B — Objective                            | MCQ (TRUE/FALSE, match) where parseable; short blanks as self-check |
| **C**   | Section C — Short answer                         | Self-check — reveal model answer                    |
| **D**   | Section D — Practical                            | Self-check — reveal model answer                    |

After editing the master bank, re-run the script and redeploy / refresh GitHub Pages.

### Session size & shuffle

On the home page you can set **how many questions** to practise (default **10**, up to the size of the filtered pool) and toggle **shuffle**. Only that subset is stored for the quiz, so `sessionStorage` stays small.

Results save **question IDs** only, then the results page **reloads `questions.json`** to show the **full question text and model answers** in review (works on GitHub Pages; use a local server for `file://` testing).

## Run locally

From this folder, serve files over HTTP (needed so `fetch("questions.json")` works):

**Python 3**

```bash
cd quiz-app
python -m http.server 8080
```

Open `http://localhost:8080`.

**Node (npx)**

```bash
cd quiz-app
npx --yes serve -l 8080
```

Opening `index.html` as a `file://` URL may block loading JSON in some browsers — use a local server.

## Add or upload questions

Edit **`questions.json`**. It must be a **JSON array** of objects with:

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `question` | string | yes | Stem shown to the student |
| `options` | string[] | yes | At least two choices |
| `correct_answer` | string | yes | Must **exactly match** one of the `options` strings (after trim) |
| `explanation` | string | recommended | Shown after checking the answer |
| `difficulty` | string | optional | e.g. `easy`, `medium`, `hard` (used for filter) |
| `topic` | string | optional | Used for filter; home page lists unique topics |

Example:

```json
{
  "question": "What is accuracy?",
  "options": [
    "TP/(TP+FP)",
    "(TP+TN)/N",
    "FN/(FN+TP)",
    "FP/(FP+TN)"
  ],
  "correct_answer": "(TP+TN)/N",
  "explanation": "Accuracy measures overall correctness of the model.",
  "difficulty": "easy",
  "topic": "metrics"
}
```

Validate JSON (e.g. [jsonlint.com](https://jsonlint.com)) before committing.

**Bulk import:** You can generate `questions.json` from a spreadsheet: export CSV → small script to emit JSON with the fields above, then replace `questions.json`.

## Deploy on GitHub Pages

1. Create a GitHub repository and push the **`quiz-app`** folder contents (or put this folder at repo root).

2. **Repo root site**  
   - Settings → **Pages** → Build: **Deploy from a branch** → Branch `main`, folder **`/ (root)`**  
   - Your site URL: `https://<user>.github.io/<repo>/`  
   - Ensure `index.html` is at the root of what Pages serves.

3. **`/docs` folder**  
   - Put everything inside `docs/` → Pages source: **/docs** on `main`.

4. **Project subpath**  
   If the app lives at `https://<user>.github.io/<repo>/quiz-app/`, upload the **contents** of `quiz-app` into that path so `index.html` and `questions.json` sit together. Relative URLs in the project already work.

5. After push, wait a minute and open the Pages URL. Hard-refresh if assets look cached.

**Note:** The app uses relative paths (`questions.json`, `quiz.html`). Do not change asset paths unless you also adjust links or add a base URL helper.

## Customisation

- **Colours / fonts:** `styles.css` (`:root` and `html[data-theme="dark"]`).  
- **Shuffle questions:** In `script.js`, after filtering, add `shuffleArray(filtered)` before `sessionStorage.setItem(FILTERED_KEY, ...)`.  
- **Countdown timer instead of count-up:** Replace the timer logic in `initQuiz()` in `script.js`.

## Licence

Use freely for teaching and revision.
