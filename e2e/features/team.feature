Feature: The team of a business

  As the owner of a shop
  I want to bring my staff into the system with the right permissions
  So that the business does not depend on me being the only one who can use it

  # The interesting scenario here is the third one. The free plan allows two
  # people, and what has to be true is that the "no" comes from the server: the
  # form stays submittable on purpose, because a disabled button is not a limit —
  # anyone can invoke the Server Action directly.
  #
  # A pending invitation holds a seat. That is a product decision, not an
  # accident: charging the seat on acceptance would let an owner send ten
  # invitations and reject the ninth person two days later, when there is nothing
  # they can do about it.

  Background:
    Given I am signed in as an owner

  Scenario: The team page lists who works in the business
    When I open the team page
    Then I should see the person "demo@corebiz.local"
    And I should see how many seats the plan allows

  Scenario: Inviting someone produces a link that is shown only once
    Given the business is on the paid plan
    When I open the team page
    And I invite a new person as a salesperson
    Then I should see a single-use invitation link
    And the invitation shows up as pending

  Scenario: The free plan stops the invitations when the seats run out
    Given the business is on the free plan
    When I open the team page
    And I keep inviting people until the plan says no
    Then I should see that there are no seats left

  Scenario: The activity log is only for owners and administrators
    Given I am signed in as a salesperson
    When I open the activity page
    Then I should see that the activity log is not for me
