# 🎓 Smart Scholarship Finder and Academic Eligibility Matcher

A web-based application designed to help students discover scholarship opportunities and identify scholarships that may match their academic profile and eligibility criteria.

## 📌 About the Project

Finding suitable scholarships can be challenging because information is distributed across different sources and eligibility requirements vary between schemes.

**Smart Scholarship Finder** provides a centralized interface where students can explore scholarship records, filter opportunities, and evaluate potential eligibility using a matching system.

This project was developed as part of the **Web Technology IA3** academic project.

## ✨ Features

- 🔍 **Scholarship Search** — Search available scholarship records.
- 🎯 **Eligibility Matcher** — Compare student details against available scholarship criteria.
- 🗂️ **Filtering** — Narrow results using supported filters.
- 💾 **Saved Scholarships** — Save interesting opportunities for later reference.
- 📋 **Scholarship Details** — View information about individual scholarship records.
- 📱 **Responsive Interface** — Designed for convenient use across different screen sizes.
- ⚡ **REST API** — Connect the frontend with the backend.
- 🗄️ **Database Integration** — Store and retrieve scholarship records using MongoDB.
- 🎨 **Modern UI** — Education-focused design with interactive elements and animations.

*Feature availability depends on the current implementation.*

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Webpage structure |
| CSS3 | Styling, responsive layout, and animations |
| JavaScript | Frontend interactions |
| Node.js | Backend runtime |
| Express.js | Server and REST API |
| MongoDB | NoSQL database |
| Mongoose | Database models and queries |

## 🏗️ System Architecture

```text
Student
   |
   v
Frontend
HTML + CSS + JavaScript
   |
   v
REST API
   |
   v
Node.js + Express.js
   |
   v
Mongoose
   |
   v
MongoDB
```

## 📂 Project Structure

```text
smart-scholarship-finder/
├── config/
│   └── db.js
├── controllers/
│   └── scholarshipController.js
├── models/
│   └── Scholarship.js
├── routes/
│   └── scholarships.js
├── scripts/
│   └── seed.js
├── tests/
│   └── matchScorer.test.js
├── utils/
│   └── matchScorer.js
├── public/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
├── .env.example
├── .gitignore
├── package.json
└── server.js
```

## ⚙️ Installation and Setup

### Prerequisites

Install the following:

- [Node.js](https://nodejs.org/)
- [MongoDB Community Server](https://www.mongodb.com/try/download/community)
- [MongoDB Compass](https://www.mongodb.com/try/download/compass)
- Git

### 1. Clone the repository

```bash
git clone https://github.com/anthonyhadin-coder/smart-scholarship-finder.git
cd smart-scholarship-finder
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root.

```env
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/smart_scholarship_finder
NODE_ENV=development
```

Use the database name configured for your local project. Never commit your `.env` file or secrets to GitHub.

### 4. Start MongoDB

On macOS with MongoDB installed through Homebrew:

```bash
brew services start mongodb/brew/mongodb-community
```

### 5. Insert sample scholarship records

```bash
npm run seed
```

The seed script should populate the configured database with sample records. Run it from the project root.

**Important:** Sample records are illustrative testing data and should not be treated as verified or currently available official scholarships.

### 6. Start the application

For development:

```bash
npm run dev
```

Alternatively, use the start command configured in `package.json`:

```bash
npm start
```

Open the application at:

`http://localhost:3001`

The actual port depends on your environment configuration.

## 🔎 How Eligibility Matching Works

1. The student enters the requested academic and personal information.
2. The frontend sends the information to the backend.
3. The matching logic compares the student profile with available scholarship criteria.
4. The system calculates a match score based on the implemented rules.
5. The frontend displays the matching results.

**Disclaimer:** A match score is an indicative result, not a guarantee of official eligibility or scholarship approval. Missing or outdated criteria can affect matching accuracy.

## 🧪 Testing

Run the project's available tests with:

```bash
npm test
```

Verify the database connection, scholarship API responses, search and filtering features, and eligibility matching before using the application in a demonstration.

## 🔮 Future Enhancements

- Integration with verified official scholarship sources.
- Scholarship application deadline reminders.
- Student registration and personalized profiles.
- Administrative dashboard for managing scholarship records.
- Improved eligibility explanations and data validation.
- Scholarship document checklists.
- Enhanced accessibility and multilingual support.

These are proposed improvements and may not be implemented in the current version.

## 🔐 Data and Security

- Keep environment variables and credentials out of version control.
- Validate and sanitize user inputs.
- Use verified sources for official scholarship information.
- Review eligibility criteria and application deadlines with the relevant scholarship provider.
- Avoid storing unnecessary sensitive student information.

## 👨‍💻 Developer

**Anthony Hadin**

B.Tech — Computer Science and Engineering  
Karunya Institute of Technology and Sciences

GitHub: [@anthonyhadin-coder](https://github.com/anthonyhadin-coder)

## 📄 Disclaimer

This project is developed for educational and demonstration purposes. Scholarship records may include illustrative sample data. Users should verify the official eligibility requirements, deadlines, and application procedures with the respective scholarship providers.

The application does not guarantee scholarship eligibility, selection, or funding.

## ⭐ Acknowledgements

Developed as a Web Technology academic project to explore frontend development, REST API integration, backend programming, database management, and eligibility-matching logic.

---

**If you find this project useful, consider giving the repository a star!**
