import unittest
from api.app import app
from core.portfolio import get_portfolio_status, get_performance
from db.database import (
    init_db, get_ticker_data, create_portfolio, save_transactions, get_all_portfolio_names
)
from core.report_generator import generate_portfolio_report_with_gemini
import os

class TestAppEndpoints(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_health_check(self):
        response = self.app.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertIn('status', response.get_json())

    def test_portfolio_status(self):
        # This assumes at least one portfolio exists
        portfolios = get_all_portfolio_names()
        if portfolios:
            response = self.app.get(f'/portfolio/{portfolios[0]}')
            self.assertIn(response.status_code, [200, 404])
        else:
            self.skipTest('No portfolios available for testing')

class TestPortfolioLogic(unittest.TestCase):
    def setUp(self):
        # Ensure a test portfolio exists
        create_portfolio('test_portfolio')
        save_transactions('test_portfolio', [
            {"ticker": "AAPL", "quantity": 10, "price": 100, "date": "2024-01-01"},
            {"ticker": "GOOG", "quantity": 5, "price": 200, "date": "2024-01-02"}
        ])

    def test_get_portfolio_status(self):
        status = get_portfolio_status('test_portfolio')
        self.assertIn('holdings', status)
        self.assertIn('total_value', status)

    def test_get_performance(self):
        perf = get_performance('test_portfolio')
        self.assertIsInstance(perf, list)

class TestDatabase(unittest.TestCase):
    def test_init_db(self):
        # Should not raise
        init_db()

    def test_get_ticker_data(self):
        data, last_updated = get_ticker_data('AAPL')
        # Accept None if not present
        self.assertTrue(data is None or isinstance(data, dict))

class TestReportGenerator(unittest.TestCase):
    def test_generate_portfolio_report(self):
        # Use test_portfolio, may return None if no data
        status = get_portfolio_status('test_portfolio')
        returns = get_performance('test_portfolio')
        report, _ = generate_portfolio_report_with_gemini('test_portfolio', status, returns, force=True)
        self.assertIsInstance(report, dict)

if __name__ == '__main__':
    unittest.main()
