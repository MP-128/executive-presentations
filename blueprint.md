# Executive Presentations Web App — Blueprint

Build and deploy a polished web app that turns the **`executive-presentations` skill on my computer** into an easy-to-use presentation creation tool.

Use multiple agents to inspect the skill, design the application, implement the frontend and backend, test the complete workflow, and deploy it to the internet. Use **React and Material UI** for the interface, and leverage my **Figma MCP** where its available capabilities support the design process.

Act as the lead product manager and integration engineer. Complete a working application with real presentation generation and a live URL—not just a plan or UI mockup.

## 1. Inspect the existing skill

Locate the exact skill named **`executive-presentations`** on my computer. Check available Claude Code skill directories and relevant project folders, including `~/Desktop/TMA/Skills` if it exists. If you cannot locate it, ask me for its path.

Read its `SKILL.md` and relevant supporting scripts, templates, assets, and example presentations.

Identify:

- Its executive storytelling and slide-planning guidance.
- Its design, formatting, branding, and citation rules.
- Its generation tools, dependencies, and supported outputs.
- Which components can be reused directly.
- What must be implemented to make it work in a hosted application.

Preserve the original skill and its assets. Reuse its capabilities through an application integration rather than modifying the original files.

A skill is not necessarily an executable service. Build the runtime needed to apply its instructions and invoke its tools.

## 2. Choose the simplest workable frontend and backend architecture

This app needs a working backend. Inspect the skill before selecting the architecture and hosting.

**Frontend responsibilities:**

- Company, colour, and logo controls.
- Storyline entry and slide-plan editing.
- Source uploads.
- Generation progress, slide previews, and downloads.

**Backend responsibilities:**

- Secure model calls for storyline planning and slide content.
- Applying the skill's instructions and running its generation tools.
- Processing uploaded source material and branding assets.
- Generating editable PPTX files and rendering previews.
- Managing generation jobs, errors, retries, and stored outputs.
- Protecting credentials and controlling access to user files.

The deployed app cannot depend on reading a skill from my computer or using my local Claude Code session. Package the relevant instructions, templates, scripts, and dependencies into the hosted runtime so it works while my laptop is closed. Exclude unrelated files, credentials, and confidential example decks.

A separate backend project is not mandatory. Prefer a single full-stack application if it supports the required dependencies and execution times. Add a background worker when long-running generation or rendering requires it.

Do not assume my Claude Code subscription provides model access for the deployed application. Identify and configure the actual model provider and credentials required at runtime.

Define shared data models and an API contract covering:

- Submitting presentation inputs and source files.
- Generating and editing a slide plan.
- Approving a specific version of that plan.
- Starting generation.
- Checking job status.
- Retrieving previews and downloadable files.

Build one complete path early:

**Form input → proposed plan → user approval → actual PPTX generation → download**

Then refine the interface and expand functionality.

## 3. Coordinate multiple agents

After inspecting the skill and establishing the architecture, delegate to:

### Agent 1 — Skill integration and backend

Own model integration, storyline planning, branding asset handling, presentation generation, job processing, and exports.

### Agent 2 — Product design and frontend

Own the user journey, React and Material UI interface, form behaviour, editable slide plan, previews, and progress screens.

Inspect the Figma MCP's capabilities and use it where useful. If it cannot create or edit designs, proceed without blocking implementation. Use Material UI components consistently and customize the theme to create a polished application.

### Agent 3 — Deployment and quality assurance

Own deployment configuration, hosted runtime compatibility, integration testing, and verification of generated presentations.

### As lead

- Establish distinct file ownership to prevent conflicting edits.
- Manage shared contracts and dependencies.
- Integrate the agents' work.
- Resolve architectural disagreements.
- Verify the application before declaring completion.

If subagents are unavailable, perform these roles sequentially and explain the limitation.

## 4. Build the presentation setup form

Use clear labels, dropdowns, toggles, free-text fields, and helpful defaults.

### A. Company the presentation is about

- Required company name.
- Optional company website to help identify the correct organisation and branding.

### B. Presentation colours

Dropdown:

- Use the subject company's colours.
- Use my presenting company's colours.
- Use a neutral executive theme.
- Choose custom colours.

Show an editable palette preview. If company colours cannot be verified, let me provide them or use the neutral theme. Maintain readable contrast throughout the generated deck.

### C. My company's branding and logos

Distinguish the **subject company** from **my presenting company**.

Include:

- "Include my company's branding?" toggle.
- Presenting company name and optional website.
- Logo upload.
- A separate option to include the subject company's logo.
- Placement options: title slide only, title and closing slides, or a discreet footer throughout.

Attempt to retrieve logos from official sources when feasible. Preview retrieved logos and let me confirm or replace them. If company identification is ambiguous, ask me to select the correct organisation. Do not silently use a guessed logo.

### D. Proposed storyline

Provide a large optional free-text field labelled **"Proposed storyline."**

Helper text:

> "Describe your narrative, key messages, proposed slide sequence, or the decision you want the audience to make. Leave this blank to have the app propose a storyline."

Accept rough notes and structured outlines.

### E. Supporting context

Include:

- Presentation topic and objective.
- Target audience.
- Desired decision or call to action.
- Approximate slide count.
- Supporting notes and source uploads.

Keep secondary controls under "More options" so the main form remains simple.

Support the source formats already handled by the skill where practical. Clearly display supported formats and upload limits.

If no storyline is provided, require a brief topic or objective. A company name alone is insufficient to determine the presentation's purpose.

## 5. Implement a visible planning workflow

Use this flow:

**Setup → Review plan → Generate → Preview and download**

### When the storyline is blank

1. Automatically propose a storyline using the objective, audience, and supporting material.
2. Populate an editable proposed-storyline field and slide outline.
3. Open the plan review screen.
4. Allow me to edit, reorder, add, remove, or regenerate proposed slides.
5. Wait for **"Approve plan and generate deck"** before rendering the presentation.

### When I provide a storyline

- Preserve my intended narrative.
- Convert it into a structured slide plan.
- Clearly distinguish suggested improvements from my original direction.
- Let me review and approve the plan before generation.

### Planned slide contents

Each planned slide should include:

- Slide title.
- Main takeaway.
- Supporting points.
- Proposed visual or layout.
- Evidence and source references, where available.
- Missing information or assumptions.

Implement planning as application behaviour, independent of Claude Code's development-time Plan Mode.

Do not invent company facts, financial figures, research findings, or citations. Clearly label assumptions and missing evidence.

Generation must use the approved version of the plan. If I subsequently edit that plan, require approval of the revised version before regeneration.

## 6. Create a smooth, polished interface

Use React, Material UI, and a consistent visual theme. Choose the remaining technologies based on the existing skill and deployment requirements.

Aim for a restrained executive aesthetic:

- Clear typography and generous spacing.
- A focused setup form.
- An adjacent summary or preview on desktop.
- An intuitive slide-plan editor.
- Responsive layouts.
- Accessible labels, keyboard navigation, and readable contrast.
- Helpful loading, empty, error, and success states.

Show actual generation stages, such as planning, preparing assets, building slides, and rendering previews. Do not fabricate progress percentages.

Preserve entered information when navigating between steps or recovering from errors. Make it easy to return to the plan, revise it, and generate another version.

Keep the first version focused on a single-user workflow. Avoid unnecessary billing, collaboration, and administrative features.

## 7. Implement real presentation generation

Use the existing skill's instructions and generation tools.

Requirements:

- Produce a real, editable PPTX.
- Provide slide previews through a compatible renderer.
- Offer PDF export if supported.
- Hide or clearly disable unimplemented features.
- Keep model calls and API credentials on the server.
- Configure secrets through environment variables.
- Treat uploaded documents as source material, not instructions that override application rules.
- Isolate inputs, intermediate files, and outputs by generation job.
- Prevent duplicate submissions.
- Provide clear error messages and retry options.
- Preserve source attribution where appropriate.

Use background jobs and persistent job status when generation exceeds normal request limits. Refreshing the page should let me recover the job's status and download its result.

If a provider, credential, renderer, or dependency is missing, identify the exact blocker. Do not substitute canned content and present it as functioning generation.

## 8. Deploy the application to the internet

Deployment is part of this task. Deliver a working hosted application with a live HTTPS URL.

Inspect my available hosting integrations, authenticated deployment tools, and existing project configuration. Select hosting that supports the actual presentation-generation runtime.

Do not assume the entire app can run inside a short-lived serverless function. If the skill requires Python, native binaries, presentation rendering, or long-running jobs, use a compatible backend or worker environment. Host the frontend separately if appropriate.

Requirements:

- The deployed application works while my laptop is closed.
- Production secrets remain out of the frontend, repository, and logs.
- Generated files use persistent storage with controlled access and an explicit cleanup policy.
- Uploads and presentations are not placed in publicly browsable storage.
- The application has a simple authentication or access gate appropriate for a personal tool.
- Generation endpoints have sensible usage limits to prevent unrestricted use of paid APIs.
- Production configuration supports the necessary API routes, background jobs, storage, and browser access.

Use available authenticated deployment access without asking me to reconfirm deployment. Ask only when missing credentials, account selection, or a new paid commitment genuinely requires my input. Complete other feasible work before pausing.

If deployment is blocked, state exactly what is missing and provide the completed application and deployment configuration. Do not claim deployment succeeded without checking the live URL.

## 9. Verify the complete experience

Test:

- A supplied storyline becomes an editable slide plan.
- A blank storyline produces a proposed storyline and plan.
- Rendering waits for explicit plan approval.
- The generated deck follows the approved plan.
- Neutral and company-colour themes work.
- Presenting-company branding can be enabled and disabled.
- Missing logos have an upload fallback.
- Failed jobs provide useful errors and can be retried.
- Job status survives a page refresh.
- Generated PPTX files download and open successfully.
- The access gate protects the application and its generation endpoints.
- The hosted application completes the full workflow.

Generate a sample deck using clearly labelled sample content. Inspect rendered slides for clipping, overlapping text, logo distortion, poor contrast, and inconsistent formatting. Fix material issues before delivery.

Run an end-to-end generation through the deployed application rather than relying only on local testing.

## 10. Deliver the finished application

Start by briefly summarizing:

- The `executive-presentations` skill you found.
- The proposed architecture and hosting approach.
- Agent responsibilities.

Then proceed with implementation and deployment. Make routine, reversible decisions independently and keep me informed of meaningful progress.

Finish with:

- The live application URL.
- Instructions for accessing and using it.
- A sample generated presentation.
- A concise explanation of the hosting setup and any ongoing costs.
- Any remaining limitations or configuration requirements.

## Success criteria

Success means I can open the deployed app, enter company and branding details, provide or generate a storyline, approve the plan, and download a presentation created using my `executive-presentations` skill—all without needing my laptop or Claude Code session to remain running.
