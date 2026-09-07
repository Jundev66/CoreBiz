Feature: Buying goods and putting them into stock

  As a shop owner
  I want to record what my suppliers deliver
  So that the stock reflects what is actually on the shelf

  # This is the scenario that closes the loop of the whole system: buy, stock,
  # sell. What has to be true is that receiving goods moves the SAME balance that
  # issuing a delivery note moves — one ledger, not two.
  #
  # The module is on the paid plan. The gate lives in the use case, not in the
  # menu link: the locked module stays visible on purpose, because knowing that
  # something else exists is part of how an honest freemium works.

  Background:
    Given I am signed in as an owner

  Scenario: The free plan sees the module but cannot use it
    Given the business is on the free plan
    When I open the purchases page
    Then I should see that purchases require the paid plan
    And I should not see any supplier

  Scenario: Registering a supplier
    Given the business is on the paid plan
    When I open the suppliers page
    And I register a new supplier
    Then the supplier appears in the list

  Scenario: Receiving goods raises the stock by what arrived
    Given the business is on the paid plan
    And there is at least one supplier
    And I note the current stock of "HRN-001"
    When I record a delivery of 15 units of "HRN-001"
    Then the delivery is recorded successfully
    And the stock of "HRN-001" went up by 15

  Scenario: A delivery cannot be recorded without lines
    Given the business is on the paid plan
    And there is at least one supplier
    When I record a delivery with no lines
    Then I should see an error saying the delivery needs at least one product
