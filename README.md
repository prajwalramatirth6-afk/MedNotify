# MedNotify 💊

MedNotify is a medicine reminder and health information application built to help users organize their medication schedules and keep track of important health details.

## Features

- **Medication Management:** Add and manage medicines with dosage, frequency, and schedule details.
- **Medicine Reminders:** Receive reminders for scheduled medications.
- **Prescription Management:** Keep track of prescription information.
- **AI Health Assistant:** Get general medication-related information using Google's Gemini API.
- **Daily Health Tips:** View general health tips.
- **Pharmacy Finder:** Find nearby pharmacies.

## Tech Stack

- React
- TypeScript
- Vite
- Google Gemini API
- Browser Local Storage

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/prajwalramatirth6-afk/MedNotify-new-2.git
   ```

2. Navigate into the project:

   ```bash
   cd MedNotify-new-2
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure your Gemini API key using the environment setup required by the project.

5. Start the development server:

   ```bash
   npm run dev
   ```

## Data Storage

The current version uses browser Local Storage to retain application data. It does not currently use a dedicated cloud database.

## Important Note

MedNotify is an educational project. Its AI-generated information is for general informational purposes and should not replace professional medical advice.

## Future Improvements

- Secure server-side API integration
- Cloud database integration
- User authentication
- Improved reminder scheduling
- Automated testing
