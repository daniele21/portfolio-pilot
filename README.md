# PortfolioPilot

PortfolioPilot is a full-stack application for portfolio management, analysis, and reporting. It features a Python backend for data processing and a modern React/TypeScript frontend for user interaction.

## Features

- Portfolio tracking and performance analysis
- Integration with market data sources
- KPI and report generation
- Interactive charts and visualizations
- User authentication and settings management

## Demo

### Screenshots

*Portfolio Overview*
![Dashboard Screenshot](demo/Screenshot%202025-07-10%20alle%2009.42.32.png)

*Asset Allocation*
![Portfolio KPIs](demo/Screenshot%202025-07-10%20alle%2009.42.40.png)

*Portfolio Performance & Benchmark Comparison*
![Performance Chart](demo/Screenshot%202025-07-10%20alle%2009.43.08.png)

*Asset Comparison*
![Asset Allocation](demo/Screenshot%202025-07-10%20alle%2009.43.31.png)

*Asset Performance Overview*
![Portfolio Details](demo/Screenshot%202025-07-10%20alle%2009.45.21.png)

### Videos

<video src="demo/Registrazione%20schermo%202025-07-10%20alle%2009.44.06.mov" controls width="600"></video>

<video src="demo/Registrazione%20schermo%202025-07-10%20alle%2009.52.47.mov" controls width="600"></video>

<video src="demo/Registrazione%20schermo%202025-07-10%20alle%2009.53.49.mov" controls width="600"></video>

---

## Project Structure

```
/portfoliopilot
├── backend/                # Python backend (API, data, logic)
│   ├── app.py              # Main API server
│   ├── data_fetcher.py     # Market data fetching
│   ├── database.py         # Database interface
│   ├── portfolio.py        # Portfolio logic
│   ├── report_generator.py # Report and KPI generation
│   └── ...
├── my-portfolio-app/       # React frontend
│   ├── src/                # Source code
│   ├── public/             # Static assets
│   └── ...
├── ticker_data.db          # SQLite database
├── requirements.txt        # Python dependencies
└── README.md               # Project documentation
```

---

## Backend Setup (Python)

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. **Set up environment variables:**
   - Place API keys or secrets in `backend/key` as needed.
3. **Run the backend server:**
   ```bash
   python app.py
   ```

---

## Frontend Setup (React/TypeScript)

1. **Install dependencies:**
   ```bash
   cd my-portfolio-app
   npm install
   ```
2. **Start the development server:**
   ```bash
   npm run dev
   ```
3. **Access the app:**
   - Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage

- Log in and connect your portfolio.
- View performance charts, KPIs, and reports.
- Use the chat interface for portfolio insights.
- Adjust settings and manage your account.

---

## Testing

- **Backend:**
  ```bash
  cd backend
  python -m unittest discover
  ```
- **Frontend:**
  ```bash
  cd my-portfolio-app
  npm test
  ```

---

## Contributing

1. Fork the repo and create your branch.
2. Make changes and add tests.
3. Submit a pull request.

---

## License

This project is licensed under the GNU General Public License v3.0 (GPLv3).

By using, modifying, or distributing this software, you agree to the terms and conditions of the GPLv3. See the [LICENSE](./LICENSE) file for details.

---

## Contact

For questions or support, please open an issue or contact the maintainer.

