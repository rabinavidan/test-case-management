import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { TestFlowWorld } from './world';

Given('I am a guest on the TestFlow home page', async function (this: TestFlowWorld) {
  // Documentation-only step: the modal itself navigates to '/' when opened.
});

When('I open the sign-in modal', async function (this: TestFlowWorld) {
  await this.loginPage.open();
});

Then(
  'the modal shows the TestFlow heading, the sign-in fields, and the {string} message',
  async function (this: TestFlowWorld, message: string) {
    await this.loginPage.expectModalLoaded();
    await expect(this.page.getByText(message)).toBeVisible();
  },
);

When(
  'I sign in with username {string} and password {string}',
  async function (this: TestFlowWorld, username: string, password: string) {
    await this.loginPage.login(username, password);
  },
);

Then('I should be logged in', async function (this: TestFlowWorld) {
  await this.loginPage.expectLoggedIn();
});

Then('I should see the login error {string}', async function (this: TestFlowWorld, message: string) {
  await this.loginPage.expectLoginError(message);
});

Then('I should still be logged out', async function (this: TestFlowWorld) {
  await expect(this.page.getByTestId('signin-btn')).toBeVisible();
});
