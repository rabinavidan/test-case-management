Feature: Live run collaboration
  As a tester working through a run with teammates
  I want results others record to appear on my screen immediately
  So that we never test the same case twice or work from a stale view

  Background:
    Given I am signed in to TestFlow
    And a run with test cases "Checkout" and "Refund" exists

  @regression @realtime
  Scenario: A teammate's result appears without reloading
    Given I have the run open
    And a teammate has the same run open
    When the teammate records "Checkout" as "fail"
    Then I see "Checkout" marked as "Fail" without reloading
    And I still see "Refund" marked as "Pending"

  @regression @realtime @graphql
  Scenario: A result recorded through the GraphQL API appears live
    Given I have the run open
    When "Refund" is recorded as "PASS" through the GraphQL API
    Then I see "Refund" marked as "Pass" without reloading

  @regression @graphql
  Scenario: The GraphQL run summary reflects recorded results
    When "Checkout" is recorded as "PASS" through the GraphQL API
    And "Refund" is recorded as "FAIL" through the GraphQL API
    Then the GraphQL run summary shows 1 passed, 1 failed and a 50% pass rate
    And the run is marked completed
