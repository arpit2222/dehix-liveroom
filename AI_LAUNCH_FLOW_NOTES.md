# AI Launch Flow Notes

Ye document explain karta hai ki abhi live room create karte time hum AI flow kaise chala rahe hain, PDF generation ke liye kya use ho raha hai, prompts kaise ja rahe hain, rules kya hain, aur future mein consistency/optimization ke liye kya improve kar sakte hain.

## Current Flow

Live room create karne se pehle ab 3 phases hain:

1. Business idea validation
2. Validation result + PDF download
3. Technical intake questions, then room dashboard creation

Main frontend file:

- `artifacts/dehix-live-room/src/pages/CreateRoom.tsx`

Main backend file:

- `artifacts/api-server/src/routes/launch.ts`

PDF helper:

- `artifacts/api-server/src/lib/simplePdf.ts`

## Phase 1: Business Idea Validation

User normal language mein business idea enter karta hai. Frontend `POST /api/launch` call karta hai.

Request body:

```json
{
  "rawIdea": "user ka business idea",
  "projectTitle": "short title"
}
```

Backend configured AI provider ko business validation prompt bhejta hai. Is phase mein AI ko clearly bola gaya hai:

- Technical documentation generate nahi karni.
- Freelancers select nahi karne.
- Sirf business idea analyze karna hai.
- Agar idea vague hai toh maximum 3 clarifying questions dene hain.
- Agar idea clear hai toh market, audience, competitor, revenue, risk, suggestion, SWOT aur scoring deni hai.
- Output sirf valid JSON hona chahiye.

Response database mein `LaunchSession` ke andar store hota hai:

- `rawIdea`
- `projectTitle`
- `summaryText`
- `researchText` as JSON string
- `status: reviewing`

## Phase 1 Prompt Rules

Prompt ka role:

```text
DEHIX_Idea_Analysis_JSON_Prompt
```

Assistant identity:

```text
Senior AI business strategist, startup advisor, product manager, and market analyst.
```

Tone:

```text
Professional, direct, practical, evidence-aware, and honest.
```

Important rules:

- Idea vague ho toh only impactful clarifying questions.
- Maximum 3 clarifying questions.
- Scoring 0 to 10.
- Most ideas 4 to 7 ke beech score hone chahiye.
- 8+ sirf strong ideas ko.
- Exact research available na ho toh assumption mention karna hai.
- Markdown nahi, intro nahi, sirf JSON.

Scoring dimensions:

- `market_opportunity` weight `0.25`
- `problem_clarity` weight `0.15`
- `solution_differentiation` weight `0.20`
- `execution_feasibility` weight `0.20`
- `revenue_potential` weight `0.20`

Expected output shape:

```json
{
  "step": "analysis",
  "needs_clarification": false,
  "clarifying_questions": [],
  "region_used": "string",
  "idea_summary": "string",
  "research_analysis": {
    "market_demand": "string",
    "target_audience": "string",
    "competitor_analysis": "string",
    "competitive_moat": "string",
    "revenue_model": "string",
    "unit_economics": "string",
    "cost_estimation": "string",
    "go_to_market_strategy": "string",
    "risks": ["string"],
    "suggestions": ["string"],
    "assumptions": ["string"],
    "swot": {
      "strengths": ["string"],
      "weaknesses": ["string"],
      "opportunities": ["string"],
      "threats": ["string"]
    },
    "dimensional_scores": {
      "market_opportunity": 0,
      "problem_clarity": 0,
      "solution_differentiation": 0,
      "execution_feasibility": 0,
      "revenue_potential": 0
    },
    "overall_score": 0,
    "final_verdict": "Viable | Needs Work | Not Recommended",
    "verdict_reasoning": "string"
  },
  "next_options": [
    { "id": "download_pdf", "label": "Download validation PDF" },
    { "id": "continue_technical", "label": "Continue to technical questions" }
  ]
}
```

## Phase 2: Validation Result and PDF

Frontend validation result ko readable UI mein show karta hai:

- Idea summary
- Verdict
- Overall score
- Region
- Market view
- Business model
- Dimensional scores
- Risks
- Suggestions
- SWOT

User ke paas 2 main actions hote hain:

- `Download PDF`
- `Continue to technical questions`

## PDF Generation

PDF ke liye abhi hum external npm package use nahi kar rahe. Humne custom lightweight PDF builder banaya hai:

- `artifacts/api-server/src/lib/simplePdf.ts`

Endpoint:

```text
GET /api/launch/:id/business-validation.pdf
```

PDF helper manually PDF structure banata hai:

- `%PDF-1.4` header
- PDF objects
- Helvetica font
- Text stream
- Page wrapping
- XRef table
- Trailer

PDF content `LaunchSession.researchText` se banta hai. Backend pehle saved validation JSON read karta hai, phir usko formatted lines mein convert karta hai:

- Idea summary
- Region
- Verdict
- Score
- Market and audience
- Business model
- Risks
- Suggestions
- Assumptions
- SWOT

Current PDF limitations:

- Basic text-only PDF hai.
- Tables, colors, branding, charts nahi hain.
- Non-ASCII characters strip ho jate hain.
- Layout simple hai.

Future mein better PDF ke liye options:

- `pdfkit`
- `puppeteer` with HTML template to PDF
- `playwright` PDF generation
- `docx` package for DOCX export
- HTML report + print/download flow

Recommended future approach:

Use HTML template + Playwright/Puppeteer PDF. Isse branding, tables, colors, charts, page breaks aur professional formatting better ho jayegi.

## Phase 3: Technical Intake Questions

User jab `Continue to technical questions` click karta hai, frontend call karta hai:

```text
POST /api/launch/:id/technical-questions
```

Backend 2 types ke questions return karta hai:

1. Mandatory questions
2. Optional dynamic questions

Mandatory questions fixed hain:

1. Who will use this product first, and what is the main thing they should be able to do on day one?
2. Where should the first version launch: web app, mobile app, admin dashboard, API, or something else?
3. What are the top 3 must-have features for the first usable version?
4. Will the product need user accounts, payments, file uploads, chat, maps, AI, blockchain, or third-party integrations?
5. Do you have any fixed timeline, budget range, compliance needs, or existing tools/data that the team must work with?

Dynamic optional questions configured AI provider generate karta hai business idea ke basis par.

Rules:

- Sirf 3 optional questions.
- Easy language.
- Non-technical business owner ke liye understandable.
- Mandatory topics repeat nahi karne.
- Development team ko build start karne se pehle jo context chahiye, us par focus.
- Return sirf JSON array of strings.

## Final Room Dashboard Creation

User technical intake answer karne ke baad `Create room dashboard` click karta hai.

Frontend call:

```text
POST /api/launch/:id/scope
```

Request body:

```json
{
  "answers": [
    {
      "questionId": "primary_user_goal",
      "answer": "answer text"
    }
  ]
}
```

Backend checks:

- Session current user ka hona chahiye.
- All mandatory questions answered hone chahiye.
- Optional answers agar diye hain toh save/use hote hain.

Backend final prompt mein 3 cheezein combine karta hai:

- Original business idea
- Business validation JSON
- Technical intake answers

AI se room dashboard data generate hota hai:

- Project title
- Project summary
- Estimated weeks
- Complexity
- Roles
- Milestones
- Tickets
- Technical risks
- Suggested total budget

Room create hota hai `LiveRoom` model mein:

- `title`
- `rawDescription`
- `aiScopedBrief`
- `status: scoping`

`aiScopedBrief` ke andar business validation bhi attach hota hai:

```ts
aiScopedBrief: {
  ...brief,
  businessValidation: businessAnalysis
}
```

## AI Provider Error Handling

Mock fallback nahi hai.

Current behavior:

- AI provider env missing ho toh `503`
- AI provider API fail ho toh `502`
- Frontend error toast/show karta hai

Required env vars:

- `AI_PROVIDER` optional: `auto`, `azure-openai`, or `gemini`

Azure OpenAI:
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_DEPLOYMENT`

Gemini:
- `GEMINI_API_KEY`
- `GEMINI_MODEL` optional

## Consistency Issues We May See

AI output inconsistent ho sakta hai in cases:

- JSON invalid aa jaye.
- Score weights follow na kare.
- Overall score manually galat calculate ho.
- Same idea ke liye slightly different verdict aaye.
- Dynamic questions repeat ho jayein.
- Budget/timeline estimate too high ya too low ho.
- Missing fields aa jayein.
- Technical tickets vague ho jayein.

## How To Improve Answer Consistency

### 1. Use JSON schema validation after AI response

Abhi hum JSON parse kar rahe hain, but deep validation limited hai. Better:

- Zod schema define karo.
- AI response parse ke baad validate karo.
- Missing fields ke liye repair prompt ya fallback error return karo.

Example:

```ts
const parsed = BusinessValidationSchema.safeParse(analysis);
if (!parsed.success) {
  throw new Error("Azure returned invalid validation schema");
}
```

### 2. Calculate weighted score in backend

AI ko overall score calculate karne ke bajay backend calculate kare.

Benefits:

- Same formula always.
- No hallucinated weighted average.
- Score consistency better.

Flow:

1. AI dimension scores de.
2. Backend clamp kare `0-10`.
3. Backend weighted average calculate kare.
4. Backend verdict derive kare.

Suggested verdict logic:

- `>= 7.2` = `Viable`
- `>= 4.5` = `Needs Work`
- `< 4.5` = `Not Recommended`

### 3. Set lower temperature

Azure chat completion mein temperature currently explicitly set nahi hai. Consistency ke liye:

```ts
temperature: 0.2
```

Agar model/deployment support karta ho toh use lower temperature. Business analysis mein creativity kam, consistency zyada chahiye.

### 4. Keep prompts versioned

Prompt ko inline route file mein rakhne ke bajay separate file/module mein rakhein:

```text
src/prompts/businessValidationPrompt.ts
src/prompts/technicalQuestionsPrompt.ts
src/prompts/roomScopePrompt.ts
```

Prompt version bhi save karna useful hoga:

```json
{
  "promptVersion": "business-validation-v1"
}
```

Benefits:

- Debugging easy.
- Old sessions ka behavior traceable.
- A/B testing possible.

### 5. Normalize region

Abhi AI khud `region_used` decide karta hai. Better:

- User se region optional field lo.
- Agar empty hai toh default `Global / India / US` policy define karo.
- Prompt mein exact region pass karo.

### 6. Add retry with repair prompt

If JSON invalid:

1. First response parse fail.
2. Same content ko repair prompt mein bhejo:

```text
Convert the following response into valid JSON matching this schema. Do not add new facts.
```

This improves UX without using mock data.

### 7. Use canonical business categories

AI output mein industry/category inconsistent ho sakti hai. Add fields:

```json
{
  "business_category": "SaaS | Marketplace | AI Tool | Consumer App | B2B Service | Other",
  "customer_type": "B2B | B2C | B2B2C"
}
```

Then downstream prompts more stable ho jayenge.

### 8. Save prompt input and raw AI output

Debug ke liye save kar sakte hain:

- prompt version
- cleaned JSON
- raw model response
- model/deployment
- latency
- token usage if available

This helps when user says output weird hai.

## Optimization Ideas

### Backend optimization

- Move prompts to separate modules.
- Add Zod validation for AI outputs.
- Add JSON repair retry.
- Calculate scores server-side.
- Cache dynamic questions for session.
- Save token usage and latency.
- Add stricter error messages for invalid AI response.

### Frontend optimization

- Show progress states per phase.
- Allow user to answer clarifying questions if `needs_clarification = true`.
- Add better validation for mandatory answers.
- Add editable validation summary before PDF.
- Add preview before PDF download.
- Add "Regenerate validation" button.
- Add "Use this as region" field.

### PDF optimization

Short term:

- Improve current text layout.
- Add page header/footer.
- Add section numbering.
- Add better line wrapping.

Medium term:

- Add a real PDF library like `pdfkit`.
- Or generate branded HTML and convert to PDF.

Best output:

- Use HTML/CSS template.
- Render validation report in same visual design as app.
- Export as PDF from server.

### AI output optimization

- Use lower temperature.
- Use schema validation.
- Use server-side score calculation.
- Use prompt versioning.
- Use category/region normalization.
- Add few-shot examples in prompt.
- Add max/min counts for roles, tickets, milestones.

## Recommended Next Changes

Priority 1:

- Add Zod schemas for all AI outputs.
- Move prompts into separate files.
- Add `temperature: 0.2`.
- Calculate `overall_score` and `final_verdict` in backend.

Priority 2:

- Improve PDF with HTML template or `pdfkit`.
- Add editable region/business category fields.
- Add retry/repair for invalid JSON.

Priority 3:

- Store raw AI request/response logs for debugging.
- Add automated tests for prompt parsing and mandatory question validation.
- Add a regenerate option for validation and technical questions.

## Summary

Abhi system configured AI provider based hai: Azure OpenAI ya Gemini. Business idea pehle validate hota hai, phir validation report PDF download ho sakti hai, phir technical intake questions ke answer se live room dashboard create hota hai.

Mock output nahi hai. Agar selected AI provider config ya API fail hoti hai toh user ko error dikhega.

Consistency improve karne ke liye sabse important next step hai: schema validation, backend-side score calculation, lower temperature, prompt versioning, and better PDF generation pipeline.
