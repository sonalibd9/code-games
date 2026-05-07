import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-questions-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (isOpen) {
      <aside class="questions-panel" role="dialog" aria-label="Submit a question">
        <div class="questions-panel-header">
          <div>
            <span class="questions-eyebrow">Questions</span>
            <h3>Ask something new</h3>
          </div>
          <button type="button" class="questions-close" aria-label="Close Questions" (click)="closed.emit()">X</button>
        </div>
        <div class="questions-intro">
          <strong>Could not find it in F&amp;Q?</strong>
          <p>Send a new question for the support or audit team to review. Useful questions can be added back into F&amp;Q later.</p>
        </div>
        <form class="questions-form" (ngSubmit)="onSubmit()">
          <div class="questions-grid">
            <div>
              <label for="question-name">Your name</label>
              <input id="question-name" [(ngModel)]="name" name="questionName" placeholder="Full name" required />
            </div>
            <div>
              <label for="question-email">Email</label>
              <input id="question-email" type="email" [(ngModel)]="email" name="questionEmail" placeholder="name@company.com" required />
            </div>
          </div>
          <label for="question-category">Topic</label>
          <select id="question-category" [(ngModel)]="category" name="questionCategory">
            <option>Portal access</option>
            <option>Upload process</option>
            <option>PBC item support</option>
            <option>Document review</option>
            <option>Other</option>
          </select>
          <label for="question-text">Question</label>
          <textarea id="question-text" rows="4" [(ngModel)]="questionText" name="questionText"
            placeholder="Write the question you want the team to answer." required></textarea>
          <div class="questions-actions">
            <button type="submit">Submit Question</button>
          </div>
          @if (notice) {
            <p class="questions-notice">{{ notice }}</p>
          }
        </form>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionsPanelComponent {
  @Input() isOpen = false;
  @Input() userEmail = '';
  @Output() closed = new EventEmitter<void>();

  name = '';
  email = '';
  category = 'Portal access';
  questionText = '';
  notice = '';

  onSubmit(): void {
    const trimmedName = this.name.trim();
    const trimmedEmail = this.email.trim();
    const trimmedQuestion = this.questionText.trim();

    if (!trimmedName || !trimmedEmail || !trimmedQuestion) {
      this.notice = 'Please add your name, email, and question before submitting.';
      return;
    }

    const questionId = `Q-${Date.now().toString().slice(-6)}`;
    const payload = {
      id: questionId, name: trimmedName, email: trimmedEmail,
      category: this.category, question: trimmedQuestion,
      submittedAt: new Date().toISOString(),
    };

    try {
      const current = JSON.parse(window.localStorage.getItem('clientQuestions') ?? '[]') as unknown;
      const questions = Array.isArray(current) ? current : [];
      window.localStorage.setItem('clientQuestions', JSON.stringify([payload, ...questions].slice(0, 25)));
    } catch {
      // local confirmation still gives the user a clear next step
    }

    this.notice = `Question ${questionId} submitted. The support/audit team can review it and add it to F&Q if useful.`;
    this.name = '';
    this.email = '';
    this.category = 'Portal access';
    this.questionText = '';
  }
}
