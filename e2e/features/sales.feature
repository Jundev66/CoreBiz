Feature: Issuing delivery notes

  As a shop assistant
  I want to issue delivery notes for the goods I dispatch
  So that the inventory stays accurate and the customer has a record

  # CoreBiz issues DELIVERY NOTES: internal documents with no fiscal value.
  # Nothing here should imply otherwise.
  #
  # The scenarios talk about how the stock CHANGES rather than about fixed amounts.
  # That is both more robust and a better description of the rule: what the business
  # cares about is that dispatching 20 units removes exactly 20 units, whatever the
  # starting balance happened to be.

  Background:
    Given I am signed in as an owner

  Scenario: Issuing a delivery note dispatches goods and reduces the stock
    Given I note the current stock of "HRN-001"
    When I start a new delivery note for "Bodega La Esquina"
    And I add 20 units of "HRN-001"
    And I issue the delivery note
    Then the note is issued successfully
    And the stock of "HRN-001" went down by 20

  Scenario: A delivery note cannot be issued without lines
    When I start a new delivery note for "Bodega La Esquina"
    And I issue the delivery note
    Then I should see an error saying the document needs at least one line

  Scenario: Goods cannot be dispatched beyond the available stock
    Given I note the current stock of "LCH-001"
    When I start a new delivery note for "Bodega La Esquina"
    And I add 5000 units of "LCH-001"
    And I issue the delivery note
    Then I should see an error about insufficient stock
    And the stock of "LCH-001" did not change

  Scenario: An issued note keeps the exchange rate it was issued with
    When I open the delivery note "NE-000001"
    Then the note shows the exchange rate that was applied
    And the note carries the non-fiscal notice

  Scenario: The delivery note register lists the issued documents
    When I open the delivery notes page
    Then I should see the delivery note "NE-000001"
    And I should see the delivery note "NE-000005"
