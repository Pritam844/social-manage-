# 🎬 YT Suite & Content Planner (v2.0)

[![Netlify Status](https://api.netlify.com/api/v1/badges/e7ff2b38-2339-4467-9c98-1e434fb2dfd8/deploy-status)](https://ytplanner.netlify.app/)
[![Vite](https://img.shields.io/badge/Vite-5.0+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-v12-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> A modern, all-in-one YouTube channel manager and content scheduling suite designed to streamline upload pipelines, maintain posting consistency, and organize video production resources across multiple channels.

🔗 **Live Application:** [https://ytplanner.netlify.app/](https://ytplanner.netlify.app/)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Directory Structure](#-directory-structure)
- [Installation & Setup](#-installation--setup)
- [Deployment](#-deployment)
- [Usage Guide](#-usage-guide)
- [Configuration & Firebase](#-configuration--firebase)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

Content creators and media agencies often juggle multiple YouTube channels with separate upload schedules, scattered video ideas, and disconnected asset links across notes and spreadsheets.

**YT Planner** solves this by consolidating every stage of the video workflow into a single, cohesive dashboard:
- **Set & Track Upload Goals:** Maintain consistent cadence with weekly/daily target upload goals and real-time progress bars.
- **Auto-Generate Schedules:** Populate video production pipelines automatically using channel topic idea banks.
- **Centralize Channel Assets:** Organize channel-specific script tools, Google Drive directories, and image resources in one click.

---

## ✨ Key Features

### 1. 🎯 Multi-Channel Dashboard & Goal Tracking
- Manage unlimited YouTube channels with independent upload cadences (**Weekly** or **Daily**).
- Set upload quotas per cycle (e.g., 3 videos/week) and track completion status with dynamic progress meters.
- Filter task views by **All**, **Pending**, or **Completed** to prioritize day-to-day focus.

### 2. ⚡ Intelligent Auto-Scheduler
- **Topic-Driven Scheduling:** Instantly generate schedules by automatically consuming unused ideas from your Topic Bucket.
- **Bulk Scheduling:** Plan upcoming cycles across all connected channels simultaneously with a single click.
- Automatic day distribution ensures balanced publishing intervals across the week (e.g., Mon-Wed-Fri).

### 3. 🛠️ Channel Production Workshop
- **Topic Video Bucket:** Collect video ideas, concepts, and notes; tag ideas as used or available.
- **Resource Vault:** Bookmark channel-specific image directories (Google Drive, Dropbox) and script generation tools (AI prompts, docs).
- **Status Pipeline:** Toggle task status through `Pending`, `Done`, and `Skipped` with instant visual indicators.

### 4. 📅 Interactive Progress Calendar
- Seamless toggle between **Month** and **Week** calendar views.
- Filter calendar entries by individual channel or view a global overview.
- Add, update, and manage scheduled video dates directly through the calendar grid.

### 5. 🔐 Cloud Authentication & Sync
- Built with **Firebase Authentication** supporting Email/Password and one-click **Google Sign-In**.
- Real-time cloud persistence with **Cloud Firestore**, ensuring your schedule is synchronized across all devices.

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Core** | Vanilla JavaScript (ES6+), HTML5 | Clean modular architecture without heavy framework overhead |
| **Styling** | Modern CSS3 | Custom design system with glassmorphism, responsive CSS Grid & Flexbox |
| **Bundler & Tooling** | [Vite 5](https://vitejs.dev/) | Lightning-fast HMR and optimized production bundle |
| **Backend & Auth** | [Firebase Auth](https://firebase.google.com/products/auth) | Google OAuth & Email/Password session management |
| **Database** | [Cloud Firestore](https://firebase.google.com/products/firestore) | Scalable real-time NoSQL cloud database |
| **Icons & Typography** | [Lucide Icons](https://lucide.dev/), Google Fonts | Crisp interface icons with Outfit & Inter typography |
| **Hosting & CI/CD** | [Netlify](https://www.netlify.com/) | Continuous deployment with automated build pipelines |

---

## 📂 Directory Structure

```text
yt-manager/
├── public/                # Static assets (favicons, logos)
├── auth.js                # Firebase Authentication business logic
├── db.js                  # Cloud Firestore data queries & CRUD operations
├── firebase.js            # Firebase SDK client initialization
├── router.js              # Client-side hash routing & route authentication guards
├── style.css              # Custom CSS design system, themes, and responsive rules
├── app.js                 # Primary application controller and UI state engine
├── index.html             # Main HTML entry document and navigation framework
├── vite.config.js         # Vite configuration settings
└── package.json           # Project manifest, scripts, and dependencies
```

---

## 🚀 Installation & Setup

Follow these steps to run the project locally on your machine.

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (`v18.0.0` or higher)
- [npm](https://www.npmjs.com/) (bundled with Node.js)
- [Git](https://git-scm.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/Pritam844/social-manage-.git
cd social-manage-
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

Start Vite's local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:5173
```

### 4. Build for Production

To create an optimized, minified production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

---

## 🌐 Deployment

The application is deployed on **Netlify** with continuous integration enabled directly from the GitHub repository.

### Netlify Deployment Configuration

- **Build Command:** `npm run build`
- **Publish Directory:** `dist`
- **Node Version:** `18.x` or higher

#### Single Page App (SPA) Redirects
To ensure client-side routing works on full page refreshes, ensure a `_redirects` file is included in your `public/` directory:

```text
/*    /index.html   200
```

Or configure via a `netlify.toml` in the project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 🖥️ Usage Guide

1. **Authentication:**
   - Launch [ytplanner.netlify.app](https://ytplanner.netlify.app/).
   - Sign up with an email address or choose **Continue with Google**.
2. **Add a YouTube Channel:**
   - Click **+ Add Channel** on the dashboard.
   - Enter your Channel Name, optional YouTube channel URL, target upload frequency (**Weekly** / **Daily**), and target video count.
3. **Populate Ideas in the Workshop:**
   - Click into any channel card to access the **Channel Workshop**.
   - Use the **Topic Bucket** to brainstorm upcoming video titles and notes.
4. **Auto-Schedule Tasks:**
   - Click **Auto-Schedule Tasks** inside the channel or use **Auto-Schedule All** from the main dashboard.
   - Select **Topic Video Bucket** to automatically transform brainstorming ideas into dated calendar tasks.
5. **Review in Progress Calendar:**
   - Switch to the **Progress Calendar** view in the top navigation to inspect the publication timeline in Month or Week mode.
   - Check off videos as **Done** to update your channel's target progress meter.

---

## ⚙️ Configuration & Firebase

The application connects to Firebase for authentication and database management. The Firebase credentials can be found in `firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

> **Security Note:** In a production enterprise environment, consider storing API configurations in environment variables (`.env` with `VITE_` prefix) and configuring Firestore Security Rules so users can only read and write their own data (`request.auth.uid == userId`).

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and distribute it for personal and commercial projects.
