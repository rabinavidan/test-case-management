Feature: Sign-in modal
  As a TestFlow user
  I want to sign in through the auth modal
  So that I can access my projects and test runs

  Background:
    Given I am a guest on the TestFlow home page

  @smoke @auth
  Scenario: The sign-in modal renders all expected elements
    When I open the sign-in modal
    Then the modal shows the TestFlow heading, the sign-in fields, and the "Contact your admin to get an account." message

  @smoke @auth
  Scenario: Signing in with valid credentials logs the user in
    When I sign in with username "testuser_e2e" and password "Test@12345"
    Then I should be logged in

  @regression @auth
  Scenario Outline: Signing in with invalid credentials shows an error and leaves the user logged out
    When I sign in with username "<username>" and password "<password>"
    Then I should see the login error "<error>"
    And I should still be logged out

    Examples:
      | username     | password           | error                         |
      | testuser_e2e | not-the-real-pass   | Invalid username or password  |
      | ghost_user   | whatever123         | Invalid username or password  |
