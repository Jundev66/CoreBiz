Feature: Customer directory

  As a shop owner
  I want to register and browse my customers
  So that I can issue delivery notes to them

  # These scenarios are the executable specification of the customer module.
  # They are written in business language on purpose: someone who does not read
  # TypeScript should still be able to tell whether the rules are the right ones.

  Background:
    Given I am signed in as an owner

  Scenario: The directory lists the seeded customers
    When I open the customers page
    Then I should see the customer "Bodega La Esquina"
    And I should see the customer "Ferreteria El Tornillo"

  Scenario: Registering a new customer
    When I open the new customer form
    And I fill in the customer code with "CLI-100"
    And I fill in the customer name with "Abastos El Trigal"
    And I submit the customer form
    Then I should see a success confirmation
    When I open the customers page
    Then I should see the customer "Abastos El Trigal"

  Scenario: Customer codes must be unique within the business
    When I open the new customer form
    And I fill in the customer code with "CLI-001"
    And I fill in the customer name with "Otra Bodega"
    And I submit the customer form
    Then I should see an error about a duplicate code

  Scenario: The customer name has a minimum length
    When I open the new customer form
    And I fill in the customer code with "CLI-101"
    And I fill in the customer name with "A"
    And I submit the customer form
    Then I should see a validation error on the name field

  # The quota is part of the product, not a hidden implementation detail:
  # the shop owner must be able to see how much room is left before being blocked.
  Scenario: The free plan shows the customer quota
    When I open the customers page
    Then I should see the customer quota for the free plan

  Scenario: Upgrading to the paid plan raises the quota
    Given the business is on the paid plan
    When I open the customers page
    Then I should see the customer quota for the paid plan
