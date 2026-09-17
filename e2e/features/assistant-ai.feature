Feature: Turning on the AI assistant

  As someone using CoreBiz with no AI connected yet
  I want the help panel to tell me how to connect one, or who can
  So that the assistant never looks broken when it is simply not set up

  # The guide is fixed text on purpose: it is how a company goes from "no AI" to "AI", so
  # it cannot depend on having one. The suite runs with no provider connected, and nothing
  # here connects one — these scenarios share the in-memory company with every other
  # feature, and a provider saved here would change what the rest of the suite sees. The
  # connect-and-ask flow is covered through HTTP in `apps/api/test/assistant.test.ts`.

  Scenario: An owner is guided to connect an AI
    Given I am signed in as an owner
    When I open the delivery notes page
    And I open the help panel
    Then it explains how to turn on the AI assistant
    When I follow the link to connect an AI
    Then I see the AI connection screen with the four providers

  Scenario: Someone who cannot configure it is told who can
    Given I am signed in as a salesperson
    When I open the delivery notes page
    And I open the help panel
    Then it tells me to ask an owner or admin to connect the AI
