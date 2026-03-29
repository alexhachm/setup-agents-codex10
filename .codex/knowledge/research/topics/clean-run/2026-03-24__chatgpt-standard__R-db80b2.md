---
kind: research_note
scope: project
id: R-db80b2
title: "clean-run — ChatGPT standard research"
created: 2026-03-24
updated: 2026-03-24
topics:
  - clean-run
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What are the SOLID principles in software engineering? Give a one-line definition for each.

# Findings
SOLID is a set of five object-oriented design principles popularized by Robert C. Martin; the acronym itself covers Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion. 
butunclebob.com
+1

One-line definitions:

S — Single Responsibility Principle (SRP): A module/class should have one responsibility, or one reason to change. 
Wikipedia
+1

O — Open/Closed Principle (OCP): Software entities should be open for extension but closed for modification. 
Wikipedia
+1

L — Liskov Substitution Principle (LSP): Subtypes must be usable in place of their base types without breaking expected behavior. 
Microsoft Learn
+1

I — Interface Segregation Principle (ISP): Clients should not be forced to depend on interfaces they do not use. 
butunclebob.com
+1

D — Dependency Inversion Principle (DIP): High-level and low-level modules should both depend on abstractions, not on concrete details. 
Engineering People Site
+1

For your Node.js/Electron multi-agent system, the most practical mapping is:

SRP: keep coordinator scheduling, git worktree management, SQLite persistence, and UI transport in separate services.

OCP: add new agent providers or worker strategies via plugin interfaces instead of editing coordinator core logic.

LSP: every AgentProvider implementation should honor the same contract for spawn, stream, cancel, and result handling.

ISP: split large interfaces like AgentRuntime into smaller ones such as TaskRunner, LogStreamer, and CheckpointStore.

DIP: make orchestration depend on abstractions like TaskQueue, RepoManager, and ModelClient, then inject concrete implementations. 
Microsoft Learn
+1

Tiny TypeScript example:

TypeScript
interface ModelClient {
  runTask(prompt: string): Promise<string>;
}

class OpenAIClient implements ModelClient {
  async runTask(prompt: string): Promise<string> {
    return "result";
  }
}

class WorkerCoordinator {
  constructor(private readonly modelClient: ModelClient) {}

  async execute(task: string) {
    return this.modelClient.runTask(task);
  }
}

This is mainly DIP: WorkerCoordinator depends on the ModelClient abstraction, not a specific provider implementation.

Common pitfalls:

Treating SOLID as a rule to create many tiny classes even when the system becomes harder to navigate.

Using inheritance to satisfy OCP/LSP when composition would be safer.

Making “god interfaces” for convenience, which violates ISP.

Claiming DIP but still hardcoding concrete dependencies inside constructors or factories. 
Microsoft Learn
+2
Microsoft Learn
+2

Authoritative references:

Robert C. Martin, Principles of OOD / original collection: 
butunclebob.com

Microsoft architectural guidance discussing SRP and DIP in application design: 
Microsoft Learn
+1

Because this topic is conceptual, there are no version-specific Node.js APIs or config flags tied to SOLID itself.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/clean-run/_rollup.md
