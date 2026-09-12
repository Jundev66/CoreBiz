Feature: Understanding why the system said no

  As someone using CoreBiz at the counter
  I want to know why an action was refused and what to do about it
  So that I can carry on without calling anybody

  # This is the cheapest part of the assistant and the one that does most of the work:
  # it answers from a written catalogue, with no model behind it and no request to
  # anyone. The whole suite runs with no AI provider configured, and these scenarios
  # still pass — which is the point.
  #
  # What the panel says is keyed by `errorKind`, the same key the interface already
  # uses to translate the error itself. So the panel cannot drift from the rule it is
  # explaining: if the rule stops firing that key, the explanation stops appearing with
  # it, instead of quietly describing something that no longer happens.
  #
  # The scenarios use a delivery note with no lines because that rule needs no fixture
  # and touches no stock — these run in parallel with everything else.

  Background:
    Given I am signed in as an owner

  Scenario: With nothing broken, the panel says what it is for
    When I open the delivery notes page
    And I open the help panel
    Then it only tells me what it is for

  Scenario: When a rule refuses, the panel explains it
    When I start a new delivery note for "Bodega La Esquina"
    And I issue the delivery note
    And I open the help panel
    Then it tells me what happened and what I can do

  # The half that is easy to forget. Without it, somebody fixes the problem, saves, and
  # the panel keeps explaining for five more minutes something they already solved —
  # which is worse than saying nothing, because it makes them doubt whether it saved.
  #
  # The successful write is registering a customer, deliberately: it moves no stock, so
  # this scenario can run alongside the ones that do.
  Scenario: Once the problem is solved the explanation goes away
    When I start a new delivery note for "Bodega La Esquina"
    And I issue the delivery note
    And I open the help panel
    Then it tells me what happened and what I can do
    When I register a customer just for this scenario
    And I open the help panel
    Then it only tells me what it is for
