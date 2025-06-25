import portfolio

def test_compute_portfolio_performance():
    # Replace 'TestPortfolio' with a real portfolio name in your DB for a real test
    portfolio_name = 'Degiro'
    result = portfolio.compute_portfolio_performance(portfolio_name)
    print(f"Performance for {portfolio_name}:")
    for entry in result:
        print(entry)

if __name__ == "__main__":
    test_compute_portfolio_performance()
