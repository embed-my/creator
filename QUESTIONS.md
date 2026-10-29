# Open questions

What is not known yet, and what each answer decides. Written on 2026-10-24, after the research
of 2026-10-22 to 24 (see `evals/RESULTS.md` and the AGENTS.md notes for what was settled);
questions 26–30 added on 2026-10-25 after the research on who uses H5P, and 31–32 on
2026-10-29 after the player repository's new parts. Answer them in order of the stars (★ gates
the next step); write the answer, its date and its source under the question, and leave the
question in place. The groups B and C change monthly, so an answer there carries its date and
is checked again before it is built on.

Each question says how it gets answered: **search** (web, with sources), **read** (a page or
source file by hand), **ask** (the owner's decision), **measure** (a run with the harness),
**test** (a prototype of a few hours).

## Working assumptions, 2026-10-25, updated 2026-10-29

What the plan rests on until the questions below say otherwise.

- **The engine is model-agnostic; each channel inherits its institution's model.** A Moodle
  plugin uses Moodle's AI provider; the MCP server uses the host's model; the web app takes the
  AI the user already has (paste mode), an API key, or a local server; a library takes an
  adapter from the caller. The app never has to pick a model for anyone.
- **First groups: those who hold a stock of H5P and have an AI account already** — university
  learning technologists and lecturers, open-textbook projects, Moodle agencies, and school
  teachers in Moodle-run school systems (France, Germany, Spain, Austria). US K-12 last: AI use
  is high there, but H5P is not their tool (question 4).
- **Editing existing H5P is the gap; generating new H5P is taken** for institutions (H5P's Smart
  Import inside Brightspace, Nolej for Moodle), and for agents by the player's own h5p-author
  skill.
- **The player now covers three channels the plan had to build** (h5p-offline-player,
  2026-10-23 to 29):
  - **H5P Preview**, a VS Code extension (`MissingElements.h5p-preview` 0.2.0, on the
    Marketplace and Open VSX, so Cursor and VSCodium too): a `.h5p` plays in an editor tab, and
    plays again when an agent rewrites the file. The player beside the chat, without MCP Apps.
  - **SCORM 1.2 export** (`h5p-embed --scorm`): any `.h5p` as a zip that an LMS plays and
    grades, scores and the learner's place recorded; checked in Moodle 4.5, other LMSs not tried.
    Built for teachers who hand students links and want results, French schools' Éléa first.
  - **h5p-author**, an agent skill: text-only Multiple Choice and Question Set from a prompt,
    written by the user's own agent and verified. Our editing is what none of the three does.
- **Local models are one option for institutions with hardware and strict rules**, not the base.
  An institution's own OpenAI-compatible gateway gives the same privacy without the laptop.

## A. The teachers: decides the product's shape

### 1. ★ Which AI do teachers use, by brand, in 2026? — search

The latest brand shares are from 2025 (Carnegie Learning, 650+ US educators: ChatGPT 73%,
MagicSchool 40%, Copilot 38%, Gemini 32%). Teacher Tapp (UK, autumn 2025) says teachers "rely
primarily on general-purpose tools such as ChatGPT, Gemini or Copilot", without numbers. Watch
for RAND's 2026 teacher survey (fielded April–June 2026, not published) and the full Gallup/Walton
report of October 2026.

Answer:

### 2. Do teachers want to edit existing activities, or only create new ones? — search, then ask teachers

No 2026 survey separates the two. The only evidence for editing is the UK DfE user research of
2024: adapting existing material scored highest of all teacher use cases (4.5/5 likely to use)
against 2–2.3/5 for lesson plans from scratch. Five teacher interviews with a prototype would
settle more than another search. 2026-10-25: editing needs a stock to edit, which universities,
open-textbook projects and agencies hold and a school teacher rarely does; the interviews should
be with the groups in question 4.

Answer:

### 3. What devices do teachers have, and may they install software? — search

Nothing newer than a 2018 survey (teachers mostly on Windows or macOS laptops). Chromebook
figures (about 60% of school devices) count student devices, not teachers'. Install rights
matter more than specs if the web app is the base.

Answer:

### 4. ★ Which group first, in which countries? — ask

Decides the channels to build first (question 26), the rules that apply (question 5), the
languages the evals judge (French has no samples yet), and who can judge the German and
Japanese runs.

Research of 2026-10-24/25: no source gives H5P's users by sector. Moodle (H5P built in):
161,000 registered sites, 412 million users, most sites in Spain and the US. WordPress H5P
plugin: 40,000 active installs. Lumi desktop editor: about 527,000 downloads of recent
releases. D2L sells H5P Premium with Smart Import inside Brightspace, mainly to universities;
Pressbooks (open textbooks) has H5P built in. Capterra's H5P reviewers: 60% small businesses,
27% enterprises, 13% higher education (a biased sample). Instructional designers: 80% use AI
(ATD 2025, n=232), 83% use ChatGPT (McNeill 2025, n=144). School systems: France's ministry
runs Éléa, a Moodle, in every académie since the 2025 school year, for all lycées and for
collèges on request, with H5P built in; La Digitale's free Digiquiz shares a `.h5p` by link and
its Logiquiz makes one, and académies train teachers on H5P with them, so France has a
school H5P habit with no figures attached. Germany's states run Moodle for schools (Logineo NRW
about 2,000 schools in 2020, moodle@RLP about 650, mebis in Bavaria), as do Spain's regions
(Aules, Moodle Centros, Educacyl), so H5P is one click away for tens of thousands of school
teachers there; how many use it is unknown. US K-12 quizzes run on Wayground, Kahoot, Blooket
and Google Forms, not H5P.

Candidate groups, best fit first (2026-10-29):

1. **University learning technologists and lecturers.** H5P in Moodle, Brightspace, Canvas and
   Pressbooks; years of it to adapt; AI accounts from the university (question 26).
2. **School teachers in Moodle-run systems:** France (Éléa, Digiquiz, Logiquiz), Germany,
   Spain, Austria. France is the best evidenced, and the one the player already builds for (its
   SCORM export). Usage figures: question 28.
3. **Open-textbook projects** (Pressbooks, BCcampus, eCampusOntario). H5P is their standard for
   interactivity; translating and adapting open content is editing.
4. **Moodle agencies and freelancers.** Client archives of H5P, many languages; they pay.
5. **Language teachers**, across groups 1–3: Dictation, Speak the Words, Fill in the Blanks and
   Drag the Words are their content types, and adapting texts is their daily work.
6. **Authors who build with coding agents** in VS Code, Cursor or VSCodium. Small, but reachable
   now: H5P Preview plays what the agent writes and h5p-author makes quizzes; editing would
   close the loop (question 31). Whether they come: question 32.
7. **Corporate teams.** Mostly on SCORM tools (Articulate, iSpring, Easygenerator). The SCORM
   export makes their SCORM-only LMSs a destination for H5P, but they author elsewhere; H5P use
   is in Moodle Workplace, Totara and WordPress shops.
8. **Builders of LMS products** (question 29).
9. **Offline education** (Kolibri). Mission fit, little money; low-cost devices, so not local
   models.
10. **US K-12 teachers.** High AI use, but H5P is not their tool.

Answer:

### 5. What are the rules for cloud AI in those schools? — search, after 4

GDPR practice; Hesse's guidance makes data protection a condition of classroom AI use; Ukraine
has no AI law, only Ministry of Education and Science recommendations (as of March 2026).
Teacher-authored content is lower risk than student data, but the app's wording depends on this.

Answer:

### 6. Where do finished activities go? — ask

Moodle or another LMS, H5P.com, Lumi, a plain `.h5p` file. Direct LMS upload is a large piece of
work; in or out? 2026-10-25: for the groups in question 4 the answer is mostly Moodle's content
bank, Brightspace and Pressbooks, which favours a Moodle plugin (question 27) over upload code
in the app. 2026-10-29: the player now writes any `.h5p` as a SCORM 1.2 zip (`h5p-embed
--scorm`), so an LMS that takes SCORM records scores and the learner's place with no upload
code of ours; checked in Moodle 4.5 only. Digiquiz (La Digitale) shares a `.h5p` by link, with
no results kept.

Answer:

### 28. How much H5P do the European school platforms hold and use? — search, then ask the operators

Éléa (France), Logineo NRW, moodle@RLP, mebis, Aules, Moodle Centros, Educacyl: all Moodle,
all with H5P available. France is the best evidenced: Éléa is the ministry's platform in every
académie since 2025, with "H5P resources integrated and updated"; Versailles' Éléathèque
offers 237 ready-made courses; académies train teachers on H5P with Digiquiz and Logiquiz. No
usage figures found anywhere. The operators (France's DNE and the académies' DANE, German state
media institutes, Spanish regional ministries) may publish or share them; a teacher-training
body would know. Decides whether school teachers belong in the first group or later.

Answer:

### 29. Is a library for builders a product? — ask

Moodle plugin authors, Pressbooks, Kolibri Studio, Tutor LMS and LearnDash want AI-H5P features
and would rather embed an engine than write one. The editing spine is pure JS and
model-agnostic already. A package is a different business from an app: licence, support,
versioning against the pack. Decides whether `src/` is packaged for others. The player
repository already publishes its tools this way, as JavaScript APIs with types (h5p-verify,
h5p-normalize, h5p-embed, since 2026-10-21).

Answer:

### 31. ★ Should our editing ship as an agent skill and MCP tools beside h5p-author and H5P Preview? — ask

Since 2026-10-29 the player repository has two of the three parts of "Claude Code for H5P" in VS
Code, Cursor and VSCodium: h5p-author makes a text-only quiz with the user's own agent, and H5P
Preview plays the file beside the chat, again each time it changes. An `h5p-edit` skill, or an
MCP server (questions 13–17), running our outline, check and retry engine, would let the same
agent edit any content type, with no model of ours. Also decides whether Create and h5p-author
become one authoring engine: both build from the pack's semantics; Create makes four kinds with
translated defaults, h5p-author Multiple Choice and Question Set with English defaults.

Answer:

## B. The free teacher tiers: decides the paste mode and the hosts

As of 2026-10-24: ChatGPT for Teachers (US K-12, free through June 2028, 300,000 educators);
Claude for Teachers (US K-12, launched 2026-07-14, a free year for sign-ups before 2027-06-30);
Gemini through Workspace for Education accounts; Copilot Chat through Microsoft 365 for education.
For universities: ChatGPT Edu (custom MCP connectors in beta, granted by an admin to named
people), Claude for Education, Microsoft 365 Copilot, Gemini for Education. Question 26 covers
what the first groups actually have.

### 26. ★ Which AI do the first groups have, and does it expose an API or connectors? — search, then ask

Decides the paste mode against the API-key and MCP routes, per channel. To establish, with
dates: what universities provide (ChatGPT Edu, Copilot, Claude for Education, Gemini, and their
own gateways: German academia's GWDG Chat AI is said to offer an OpenAI-compatible API to
university members, to verify); what German states provide to school teachers (telli, the
states' school assistant by FWU, and fobizz; whether either has an API or connectors, which
would decide whether those teachers can only paste); what Spanish regions and France's ministry
provide; what Moodle agencies use (API keys, most likely). The point: the app never picks a model; it takes what the
institution gives, so this list is the list of modes to build.

Answer:

### 7. ★ ChatGPT for Teachers: are custom GPTs and custom connectors included? — read, by hand

OpenAI's pages refuse automated fetching. Coverage says "connectors to other applications",
which likely means the built-in ones. Needs a manual read of the help article or an account.

Answer:

### 8. Can Free ChatGPT users use directory apps and custom GPTs? — read

GPTs: yes since May 2024, to confirm it still holds. Directory apps (launched December 2025):
unknown for Free.

Answer:

### 9. Gemini on school accounts: can teachers use Gems, and can admins add custom tools? — read

Consumer accounts reportedly can add custom MCP servers (US, 18+); Gemini Enterprise has them in
preview; school accounts are unclear.

Answer:

### 10. Copilot Chat for education: can a teacher use a shared agent, and does the tenant get MCP Apps? — read

Microsoft announced MCP Apps in Copilot Chat; whether the free education Copilot Chat gets them,
and who may add an agent, is not established.

Answer:

### 11. Claude for Teachers: does the account work in Claude Desktop with local extensions? — read, test

Also: could its "teaching skills" library carry our prompt as a skill?

Answer:

### 12. Data-training defaults per tier — read

One line each, for the sentence beside the app's Copy button: ChatGPT Free and Plus train by
default unless turned off; ChatGPT for Teachers, Edu and Business do not; Gemini on school
accounts: data-protected; Copilot Chat for education: enterprise data protection; Claude
consumer and Claude for Teachers: to check.

Answer:

## C. Hosts and terms: decides the MCP server's targets

### 13. ★ May a third-party app use a Claude subscription login, and what do the Agent SDK's terms say? — read

Needed before any route that embeds an agent runtime rather than talking to an API with a key.
Never reached by the research run.

Answer:

### 14. Copilot SDK and CLI: licence, and does a user's Copilot plan cover use inside a third-party app? — read

Not reached.

Answer:

### 15. Can Copilot Chat and Claude Code run local models? — read

Copilot Chat's bring-your-own-model by plan; Claude Code against Ollama's Anthropic-compatible
API. Not reached.

Answer:

### 16. Does Claude Desktop bundle Node for `.mcpb` bundles, and on which platforms? — read

The verifiers refuted a combined claim ("macOS and Windows only, Node bundled") without saying
which half. Decides whether a teacher needs to install Node.

Answer:

### 17. Do `.mcpb` bundles render MCP Apps, and does Jan render them at all? — test

Local stdio servers in Claude Desktop do render them (Anthropic's docs); a bundle is the same
transport, so likely yes. Goose renders them, experimentally. Jan: not found.

Answer:

### 18. Can a `blob:` frame made in an opaque-origin view load at all? — test, half a day

Decides any attempt at the player inside a chat. Claude ignores `frameDomains` (open issue since
February 2026), the Copilot app's sandbox omits `allow-same-origin`, and the player needs a
Service Worker, so the only route is a self-contained `blob:` frame. 2026-10-29: in VS Code,
Cursor and VSCodium it is settled another way: the player's H5P Preview frames a page from a
server on 127.0.0.1, where the worker registers (measured in VS Code 1.143.1, 2026-10-26), in
an editor tab beside the chat. This test now matters only for the player inside Claude
Desktop's or ChatGPT's chat.

Answer:

### 27. ★ Can a Moodle plugin run our prompts through Moodle's AI subsystem? — read Moodle's docs, then test

Moodle 4.5+ has an AI subsystem with provider plugins (OpenAI, Azure AI, Ollama documented) and
placements. If a plugin can send our prompt and get the answer back through the institution's
configured provider, with or without JSON-schema output, then editing H5P inside Moodle's
content bank needs no model choice of ours at all, and reaches every group in question 4 that
runs Moodle. To establish: which actions a provider supports (text generation, structured
output?), whether a third-party plugin may define a placement, and the Moodle versions the
state school platforms run.

Answer:

## D. H5P rules: decides tier A's dialects

### 19. ★ The text syntaxes not yet established — read the libraries' source

Settled: Fill in the Blanks (`*answer/alternative*`, `:tip` only in comments, no escaping of
`*`, `/`, `:`), Drag the Words (`*word:tip*`, `\+` and `\-` feedback, no escaping), Mark the
Words (`*word*`, single words only). To settle: Advanced Blanks, Essay, Summary, Single Choice
Set, Dictation, Crossword, Find the Words, Sort the Paragraphs, Speak the Words, and the time-
and position-bound fields in Interactive Video and Course Presentation. The docs leave edge
cases to comment threads, so the source decides.

Answer:

### 20. Which fields in the pack have an `html` widget but no `tags`? — measure, a script

There H5P's editor defaults apply (strong, em, del, h2, h3, a, ul, ol, table, hr, br) instead of
the semantics, and `formatOf` would read the field as plain text.

Answer:

### 21. The H5P hub's usage ranking newer than December 2022 — search

To confirm the top 12 (Course Presentation, Interactive Video, Question Set, Drag and Drop, Drag
the Words, Column, Multiple Choice, Fill in the Blanks, Interactive Book, Image Hotspots,
Accordion, Dialog Cards).

Answer:

## E. Measurements, not searches: decides the model modes

### 22. ★ Frontier models on the 23 tasks, with the schema and without it — measure

The second number is the paste mode's real quality: a chat window cannot hold a model to a JSON
schema, so the runner needs a mode without `response_format` and JSON parsed from text.

Answer:

### 23. The three tasks Gemma never managed, on frontier models — measure

Better wrong answers, a harder question, simpler wording on dense text.

Answer:

### 24. Can Gemma 4 E4B drive our tools in a free tool-calling loop? — measure, in LM Studio or Goose

Decides whether local models can use hosts at all, or only our own one-shot pipeline.

Answer:

### 25. Saving a 500 MB package — test

Whether zip.js copies entries without recompressing (`passThrough`), and the time and memory it
takes; Rust in Tauri as the fallback.

Answer:

### 30. A mid-size open model through a gateway on the 23 tasks — measure

Institutional gateways and state assistants often serve open models of 30–70B parameters
(Llama, Mistral, Qwen), between Gemma 4 E4B and the frontier models. Their quality on our tasks,
with the schema and without it, decides whether the paste mode and the gateway mode can promise
the same as the frontier models or need the retry and the required-fields check more.

Answer:

### 32. Are the player's new channels used? — measure, monthly

H5P Preview on its first day (2026-10-29): 2 installs on the Marketplace, 188 downloads on Open
VSX. Watch its installs, the npm downloads of h5p-embed (the SCORM writer) and h5p-verify, and
issues opened by teachers. Decides whether authors with coding agents (question 4, group 6) are
worth building for before the Moodle plugin.

Answer:
