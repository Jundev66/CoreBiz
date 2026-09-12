Feature: Customer directory

  As a shop owner
  I want to register and browse my customers
  So that I can issue delivery notes to them

  # These scenarios are the executable specification of the customer module.
  # They are written in business language on purpose: someone who does not read
  # TypeScript should still be able to tell whether the rules are the right ones.
  #
  # NOBODY TYPES A CODE. The system assigns it — CLT26000001 — and the shop only
  # provides the name. There used to be a scenario here about rejecting duplicate
  # codes; it is gone because the situation cannot arise any more, and a scenario
  # that can never fail is worse than no scenario: it reads like a guarantee.

  Background:
    Given I am signed in as an owner

  Scenario: The directory lists the seeded customers
    When I open the customers page
    Then I should see the customer "Bodega La Esquina"
    And I should see the customer "Ferreteria El Tornillo"

  Scenario: Registering a new customer, without inventing a code
    When I open the new customer form
    And I fill in the customer name with "Abastos El Trigal"
    And I submit the customer form
    Then I should see a success confirmation
    And the confirmation shows the code the system assigned
    When I open the customers page
    Then I should see the customer "Abastos El Trigal"

  Scenario: The customer name has a minimum length
    When I open the new customer form
    And I fill in the customer name with "A"
    And I submit the customer form
    Then I should see a validation error on the name field

  # Archiving, and not deleting: a customer with delivery notes cannot be removed
  # without leaving documents pointing at nothing.
  #
  # This scenario registers its OWN customer, with a name unique to the run. Two
  # reasons, and both were learned by breaking something: archiving a seeded customer
  # would make the first scenario of this very file fail, because the suite shares a
  # server; and a FIXED name leaves residue, so the second run finds an archived one
  # and a live one with the same name and stops meaning anything.
  Scenario: Archiving a customer takes it out of the list, reversibly
    When I register a customer just for this scenario
    And I open its details
    And I archive the customer
    Then the customer shows as archived
    When I open the customers page
    Then I should not see that customer
    When I show the archived customers
    Then I should see that customer

  # Correcting, not re-registering. Before this existed, fixing a mistyped phone number
  # meant archiving the customer and creating another one — which is born with a NEW
  # code and leaves the delivery notes already issued pointing at a dead record.
  Scenario: Correcting a customer's details keeps the code it was given
    When I register a customer just for this scenario
    And I open its details
    And I note the code the system gave it
    And I correct the customer name and phone
    Then I should see the corrected details on the record
    And the code is still the one it was given
