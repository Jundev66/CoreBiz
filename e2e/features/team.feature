Feature: The team of a business

  As the owner of a shop
  I want to bring my staff into the system with the right permissions
  So that the business does not depend on me being the only one who can use it

  # There used to be a seat limit here, and a scenario proving that the "no" came
  # from the server rather than from a disabled button. The limit is gone; the
  # principle it defended still governs the rest of this file, because a form that
  # merely hides an action is not an access rule — anyone can invoke the Server
  # Action directly.

  Background:
    Given I am signed in as an owner

  Scenario: The team page lists who works in the business
    When I open the team page
    Then I should see the person "demo@corebiz.local"

  Scenario: Inviting someone produces a link that is shown only once
    When I open the team page
    And I invite a new person as a salesperson
    Then I should see a single-use invitation link
    And the invitation shows up as pending

  Scenario: The activity log is only for owners and administrators
    Given I am signed in as a salesperson
    When I open the activity page
    Then I should see that the activity log is not for me
