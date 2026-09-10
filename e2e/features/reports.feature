Feature: Reading the sales figures

  As the owner of a small shop
  I want to see what the business sold and what the stock is worth
  So that I can decide with numbers instead of impressions

  # This module used to sit behind a paid plan, and this file used to be about the
  # lock: what the free plan could not reach and how the paid one opened it. There
  # are no plans any more, so what is left to check is the thing that actually
  # matters — that the figures come out, and that they come from the documents that
  # were issued rather than from a fixture.

  Background:
    Given I am signed in as an owner

  Scenario: The reports module opens and shows the figures
    When I open the reports page
    Then I should see the sales figures
    And I should see the best selling products

  Scenario: Reports are reachable from the navigation
    When I open the products page
    Then the reports link is available
