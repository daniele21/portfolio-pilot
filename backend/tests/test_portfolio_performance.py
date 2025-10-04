from core import portfolio as portfolio_core

def test_compute_portfolio_performance_smoke():
    # Use a portfolio name that may or may not exist; function should return a list (possibly empty) without raising.
    portfolio_name = 'TestPortfolio'
    result = portfolio_core.compute_portfolio_performance(portfolio_name)
    assert isinstance(result, list)
