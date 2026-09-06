Feature: Plan gating on the reports module

  As the owner of a small shop
  I want to know which features my plan includes
  So that I can decide whether upgrading is worth it

  # The gate is enforced on the server, in the use case and in the query layer.
  # Hiding the menu link would not be a limit: anyone could type the URL.

  Background:
    Given I am signed in as an owner

  Scenario: The free plan cannot open the reports module
    Given the business is on the free plan
    When I open the reports page
    Then I should see that reports require the paid plan
    And I should not see any sales figures

  Scenario: The paid plan unlocks the reports
    Given the business is on the paid plan
    When I open the reports page
    Then I should see the sales figures
    And I should see the best selling products

  Scenario: The locked module is visible in the navigation, not hidden
    Given the business is on the free plan
    When I open the products page
    Then the reports link is marked as a paid feature
