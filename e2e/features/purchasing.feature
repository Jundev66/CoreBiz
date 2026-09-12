Feature: Buying goods and putting them into stock

  As a shop owner
  I want to record what my suppliers deliver
  So that the stock reflects what is actually on the shelf

  # This is the scenario that closes the loop of the whole system: buy, stock,
  # sell. What has to be true is that receiving goods moves the SAME balance that
  # issuing a delivery note moves — one ledger, not two.
  #
  # This module used to sit behind a paid plan. It no longer does, so the only
  # thing the scenarios below care about is the ledger.

  Background:
    Given I am signed in as an owner

  Scenario: Registering a supplier
    When I open the suppliers page
    And I register a new supplier
    Then the supplier appears in the list

  Scenario: Receiving goods raises the stock by what arrived
    And there is at least one supplier
    And I note the current stock of "HRN-001"
    When I record a delivery of 15 units of "HRN-001"
    Then the delivery is recorded successfully
    And the stock of "HRN-001" went up by 15

  # Sin esta pantalla el modulo estaba cojo de una forma poco visible: se podia
  # registrar una entrada y no volver a verla nunca.
  Scenario: A recorded delivery can be opened again, with its lines
    When I record a delivery of 5 units of "CAF-001"
    And I open the recorded delivery
    Then I should see the received product "Cafe molido 250 g" with its unit cost

  Scenario: A delivery cannot be recorded without lines
    And there is at least one supplier
    When I record a delivery with no lines
    Then I should see an error saying the delivery needs at least one product

  # A supplier has no detail page of its own — it fits in its row — so correcting one
  # starts from the list and comes back to it. An archived supplier can be corrected
  # too: archiving hides, it does not freeze, and fixing the phone number of somebody
  # you stopped buying from is exactly what is needed the day you call them again.
  Scenario: Correcting a supplier's contact details
    When I register a supplier just for this scenario
    And I correct its contact person
    Then the supplier list shows the new contact person
