Feature: Project lifecycle
  As a signed-in QA lead
  I want to create and delete projects
  So that I can organize test suites per initiative

  Background:
    Given I am signed in to TestFlow

  @smoke @projects
  Scenario: Creating a new project
    When I create a new project named "Nightly Regression"
    Then a project named "Nightly Regression" appears in the projects list

  @regression @projects
  Scenario: Deleting a project removes it from the list
    Given a project named "Legacy Suite" already exists
    When I delete the project named "Legacy Suite"
    Then a project named "Legacy Suite" no longer appears in the projects list
