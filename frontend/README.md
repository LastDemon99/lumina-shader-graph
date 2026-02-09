<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kivqk6ht38bktfXOtfDWzOQayUHDgY6W

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Node “Attach” (Paperclip) = AI Focus

In the graph editor, when you select a node you’ll see a small **paperclip** icon in the node header.

- Clicking it **attaches the current selection to the AI focus** (it does *not* attach a texture).
- The app keeps a set of `attachedNodeIds` and builds a small **focused subgraph** around them (walks incoming/outgoing connections, capped).
- That focused subgraph is injected into the prompt sent to the backend as a `FOCUS ...` block, so the assistant will prefer editing within that area.
- Note: when you use slash-commands (e.g. `/editgraph`, `/generategraph`), the app intentionally does **not** inject the focus block to avoid interfering with command parsing.
