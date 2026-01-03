# Release v1.0.0

## Features
- feat: add-ons features added and managed
- feat: actualized pricing plan and subscription logic to socialbeats pricing

## Tests
- test: test suite for microservice

## Documentation
No documentation changes.
## Fixes
- fix: update microservice to adapt to new socialbeats-1.0.yaml
- fix: one failed test
- fix: tests modified to run on GitHub Action
- fix: modify .env.example to solve pr test problem
- fix: externalized space connection to create a single connection for all operations
- fix: user deleted event

## Continuous integration (CI)
No CI changes.
## Other changes
- Merge pull request #12 from SocialBeats/feat/updated-yaml
- Merge pull request #10 from SocialBeats/feat/tests
- Merge pull request #9 from SocialBeats/feat/socialbeats-pricing
- Merge pull request #8 from SocialBeats/hotfix/delete-user-event

## Full commit history

For full commit history, see [here](https://github.com/SocialBeats/payments-and-suscriptions/compare/v0.0.3...v1.0.0).

# Release v0.0.3

## Features
No new features.
## Tests
No test changes.
## Documentation
No documentation changes.
## Fixes
- fix: delete webhook secret

## Continuous integration (CI)
No CI changes.
## Other changes
- Merge pull request #6 from SocialBeats/develop

## Full commit history

For full commit history, see [here](https://github.com/SocialBeats/payments-and-suscriptions/compare/v0.0.2...v0.0.3).

# Release v0.0.2

## Features
- feat: update contract function added and fixed create free stripe contract when new user registered
- feat: preliminary command implementation for free plan

## Tests
No test changes.
## Documentation
No documentation changes.
## Fixes
- fix: centralized pricing config and avoided hardcoded plans

## Continuous integration (CI)
No CI changes.
## Other changes
- Merge pull request #5 from SocialBeats/develop
- Merge pull request #4 from SocialBeats/feat/suscription-command
- chore: hide internal api key from .env

## Full commit history

For full commit history, see [here](https://github.com/SocialBeats/payments-and-suscriptions/compare/v0.0.1...v0.0.2).

# Release v0.0.1

## Features
- feat: added kafka and delete user event listener to eliminate all suscriptions
- feat: create contract first version integrated wih stripe and space

## Tests
No test changes.
## Documentation
No documentation changes.
## Fixes
- fix: delete space contract when delete user
- fix: plan dowwngrade on subscription canceled
- fix: minnor config changes

## Continuous integration (CI)
No CI changes.
## Other changes
- Merge pull request #3 from SocialBeats/develop
- Merge pull request #2 from SocialBeats/feat/create-suscription
- Initial commit

## Full commit history

For full commit history, see [here](https://github.com/SocialBeats/payments-and-suscriptions/compare/...v0.0.1).

