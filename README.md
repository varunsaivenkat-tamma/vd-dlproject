# Vehicle Damage DL Frontend (Vite + React + Tailwind)

## Features included
- React + Vite setup
- Tailwind CSS
- Pages: Home, About, Contact, AI Dashboard, Login, Register
- Navbar + Footer
- AI Dashboard with live camera (getUserMedia) and upload folder option
- 3D model viewer (model-viewer) used for cinematic car preview
- Purple themed UI and animations via Framer Motion
- Placeholder Google Sign-in buttons and Forgot-password link

## Run locally
1. Extract the zip.
2. In project folder run:
   ```
   npm install
   npm run dev
   ```
3. Open the local dev server (usually http://localhost:5173).

## Notes
- This is a frontend skeleton. Integrate your DL backend (model endpoints) for real scanning and cost prediction.
- Replace 3D model URLs with real car GLB models for production.