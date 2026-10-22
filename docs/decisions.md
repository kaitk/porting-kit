# Decisions

The record for contributors and agents: each decision about the kit itself, dated, with
its reason and what was rejected. How the kit works now is in
[architecture](architecture.md); this page keeps why it came to work that way. The
decisions a port reuses are in the [catalogue](catalogue.md), not here. Entries run oldest
first, and a later entry that replaces an earlier one says so.

## The kit is its own repository, run by AI sessions

Decided 2026-10-03, snowtime task 081.05.

What task 081 learns becomes a repository of recipes, skills, crates, and codemods that
AI sessions use to port an app, rather than a generator that ports it alone. Each port
differs, so the kit holds what a session can't quickly work out itself and leaves the rest
to the session.

## A survey and the user's check come before any proposal

Decided 2026-10-03.

A session surveys the app, the user checks the findings, and only then does the session
propose a port per item ([the workflow](architecture.md#the-workflow)). A session that
proposes before the user has corrected the survey builds on what code can't show.

## Server functions move to an API first

Decided 2026-10-03, snowtime task 084.

The default port adds a JSON API beside the app's server functions, moves every call to
it, and then removes the server functions for both backends
([the default recipe](architecture.md#the-default-recipe-move-to-an-api)). Serving Start's
server functions from Rust was rejected as the default because it follows Start's private,
unversioned protocol (task 081.02). Keeping both wire formats was rejected because they
drift and every test would run twice, for no measured gain.

## Layers swap independently, and a clean port comes first

Decided 2026-10-05.

The kit works layer by layer, so an app that shares only its backend stack reuses the
backend recipes and crates, and the survey names exactly what is missing
([layers](architecture.md#layers-that-swap-independently)). A hybrid that keeps some
TypeScript running is a tradeoff a session proposes only when the clean port isn't
straightforward, decided from usage and profiles
([clean first](architecture.md#clean-first-hybrid-only-as-a-tradeoff)). The stretch goal
is a one-run port of an app of Snowtime's size; the kit aims at it but isn't bounded by
it.

## The kit is a template that generates a port repository

Decided 2026-10-08.

Agents generate an opinionated first version of the port as its own repository, kept in
sync with the app, and then the port is the user's ([shape](architecture.md#shape)).
Crates are optional and each plugs in alone; code shaped by one app is template code the
port owns. snowtime-native is the first instance, and regenerating it from the kit
measures the kit.

## Auth goes through better-auth-rs, with one fork for its gaps

Decided 2026-10-08 and 2026-10-11, snowtime-native tasks 081.39 and 081.40.

The auth recipe uses better-auth-rs where it matches Better Auth and keeps app code beside
it where it doesn't. Its gaps are fixed in one fork that every port shares, and each fix
is offered upstream. Hand-porting every flow, as task 081.28 did, was rejected as the
default because upstream then maintains none of it; 081.28 stays the reference and
fallback ([the recipe](../recipes/auth/better-auth.md)).

## The port lives in its own repository, with the app as a submodule

Decided 2026-10-09 and 2026-10-10.

A port is a repository that holds only what it adds, with the app as a git submodule at
the commit it implements; the render bundle's adapter belongs to the port
([the port repository](port-repository.md)). The pin marks the app features the port
implements and needn't follow every commit. One repository with a pin stays as the
layout for a proof of concept.

## Recipes are Markdown, and only the index is a skill

Decided 2026-10-11.

Recipes are Markdown, one per library under its layer, with front matter for status,
versions, and evidence ([format](../recipes/README.md)). Only `skills/port` is a skill,
which keeps the agents' skill lists short as recipes grow, and Markdown serves Claude,
Codex, and people alike. Until crates exist, a recipe's reference code points at the port
that proved it, at an exact commit.

## The kit is public, and its crates live in it

Decided 2026-10-22, snowtime-native task 081.41.

The kit is published as github.com/kaitk/porting-kit under its working name, and
licensed MIT OR Apache-2.0 like better-auth-rs, so code moves between the kit and
upstream pull requests without relicensing. The crates live in this repository, and a
port depends on them by git URL at an exact commit, as it pins the better-auth-rs fork.
A path dependency on a sibling checkout was rejected because CI and image builds can't
fetch it; keeping the crates in snowtime-native until later was rejected because the
kit is where other ports will look for them. The first crates' boundaries are open
(task 081.41).

## Machine and human documentation are split

Decided 2026-10-22.

The layout follows the goose repositories: `README.md` is for people who use the kit,
`docs/` holds the architecture, decisions, and development notes, and `AGENTS.md` with
`agents/` holds the rules for agents. Docs and commits name no people and date each
decision instead. Recipes and the catalogue keep the kit's own formats, which the goose
repositories have no counterpart for.

## The port owns its lifecycle after initialization

Decided 2026-10-22. Clarifies "The kit is a template that generates a port repository"
and replaces any implication in "kept in sync" that continued synchronization is required.

The main outcome is a well-founded port that stays maintainable after its initial
session. Its own repository holds setup, current architecture, source and coverage
records, decisions, successful and failed experiments, verification, and operating
instructions. Later sessions start from that state, without requiring the original chat.

The original-app pin records a baseline. Feature coverage and intentional differences
explain what the port actually implements, including selectively adopted later changes.
The port may change direction, omit features, stop following the original, or be
discontinued. Kit provenance and kit dependency versions are separate from that baseline;
adopting newer kit code or guidance is optional. The port's own dependency maintenance
and verification continue regardless.

This replaces a template-sync model with local ownership. The cost is keeping useful
records and executable checks in each port; that is part of the deliverable rather than
an obligation to remain compatible with the kit's latest design.

## The port skill is manually invoked and requirements lead the work

Decided 2026-10-22. Extends "A survey and the user's check come before any proposal".

Only the user starts the skill. It reads the repository and its records, assesses fit,
asks about requirements, and proposes solutions before implementing the agreed scope.
Surveying alone does not authorize a port. A poor-fit verdict, a smaller scope, or an
agreed hybrid can be the appropriate result.

Choose tested libraries, recipes, crates, generators, and port-owned code per area.
Subagents require explicit user approval and are used only where their task warrants
them. Approval of the port itself is not delegation approval. The documentation targets
Sol 6.1 and Claude Opus 5.5 without requiring either agent's private memory; actual
replays must establish how well the workflow performs.

## Retained TypeScript can be a maintained part of a port

Clarified 2026-10-22. Extends "Layers swap independently, and a clean port comes first";
the existing native-first recommendation remains a starting point for discussion.

An infrequent feature may remain TypeScript when its rewrite costs more than the
benefit and the user accepts the runtime and maintenance costs. Its presence does not
make the port incomplete for the agreed scope or require a later rewrite. The port
records the runtime boundary, source version, resource and permission limits, tests,
and conditions for reconsidering it.

The general job-host recipe is still unproven. Rendering supplies useful techniques;
jobs need their own execution resources and capability contracts, as the
[architecture](architecture.md#clean-first-hybrid-only-as-a-tradeoff) describes.

## Validate initialization and continued maintenance separately

Decided 2026-10-22. Extends the replay and second-app criteria in task 001.

First, a session without the initiating conversation recreates the Snowtime port using
the kit and declared source inputs. Evaluate requirements, design, correctness,
performance evidence, and the quality of its handover. Then a different fresh session
uses the resulting port alone to complete maintenance work and update its records.
This tests whether the port can keep working well after initialization.

SvelteKit and other framework tests follow. The render benchmark candidates in
snowtime-native task 081.15 are candidates to assess, not proven end-to-end port targets.
Successful rendering alone does not validate auth, data, API behavior, or maintenance.
