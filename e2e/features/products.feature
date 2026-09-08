Feature: Keeping the stock honest

  As the owner of a shop
  I want to correct the stock after counting a shelf
  So that what the system says matches what is really there

  # An adjustment always demands a REASON, and that is the point of the whole
  # module. Months later, nobody remembers whether three missing bags were
  # spoilage, theft or a typo — and without the reason there is no way to tell.
  # It is the kind of data that is only missed once it is too late to add.
  #
  # Two details that were learned the hard way:
  #
  # These scenarios use their OWN products. The whole suite shares one server, so
  # the first version counted the same flour the sales scenarios dispatch — and
  # left it at seven units, which made a delivery of twenty fail somewhere else
  # entirely.
  #
  # And they talk about how the stock CHANGES, never about a fixed amount. The
  # scenarios run in parallel; a fixed number would be asserting that nothing
  # else ran first.

  Background:
    Given I am signed in as an owner

  Scenario: Counting a shelf corrects the stock
    Given I note the current stock of "AZC-001"
    When I count 5 more of "AZC-001" than the system says, because of "Monday count"
    Then the stock of "AZC-001" went up by 5

  Scenario: An adjustment without a reason is refused
    Given I note the current stock of "QSO-001"
    When I count 3 more of "QSO-001" than the system says, without saying why
    Then I should see that the adjustment needs a reason
    And the stock of "QSO-001" did not change
