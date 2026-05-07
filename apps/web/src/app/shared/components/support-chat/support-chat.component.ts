import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter, OnChanges, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AURI_EMOJI, SUPPORT_QUICK_PROMPTS } from '../../../core/models/constants';
import { getSupportChatReply } from '../../../core/utils/pbc-utils';

export interface SupportChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  isTyping?: boolean;
}

@Component({
  selector: 'app-support-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (isOpen) {
      <aside class="support-chat" role="dialog" aria-label="Auri support chatbot">
        <div class="support-chat-header">
          <div>
            <span class="support-chat-eyebrow">Support</span>
            <h3><span class="support-chat-avatar" aria-hidden="true">{{ auriEmoji }}</span>Auri</h3>
          </div>
          <button type="button" class="support-chat-close" aria-label="Close support chat" (click)="closed.emit()">X</button>
        </div>
        <div #messagesEl class="support-chat-messages" aria-live="polite">
          @for (msg of messages; track msg.id) {
            <div [class]="'support-chat-message support-chat-message-' + msg.role">
              {{ msg.content }}
              @if (msg.isTyping) { <span aria-hidden="true">...</span> }
            </div>
          }
        </div>
        <div class="support-chat-prompts" aria-label="Suggested support questions">
          @for (prompt of quickPrompts; track prompt) {
            <button type="button" (click)="addExchange(prompt)">{{ prompt }}</button>
          }
        </div>
        <form class="support-chat-form" (ngSubmit)="onSubmit()">
          <label for="support-chat-input" class="sr-only">Ask support</label>
          <input id="support-chat-input" [(ngModel)]="inputValue" name="chatInput" placeholder="Ask about uploads, review, login..." />
          <button type="submit" [disabled]="!inputValue.trim()">Send</button>
        </form>
      </aside>
    }
    @if (!isOpen) {
      <button type="button" class="support-chat-launcher" aria-label="Open Auri support chatbot" (click)="launcherClicked.emit()">
        <span class="support-chat-launcher-avatar" aria-hidden="true">{{ auriEmoji }}</span>
        <span class="support-chat-launcher-copy">
          <strong>Auri is online</strong>
          <small>Ask a quick portal question</small>
        </span>
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportChatComponent implements AfterViewChecked {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() launcherClicked = new EventEmitter<void>();
  @ViewChild('messagesEl') messagesEl?: ElementRef<HTMLDivElement>;

  readonly auriEmoji = AURI_EMOJI;
  readonly quickPrompts = SUPPORT_QUICK_PROMPTS;

  inputValue = '';
  messages: SupportChatMessage[] = [
    {
      id: 'support-welcome',
      role: 'assistant',
      content: `Hi, I am ${AURI_EMOJI} Auri. I can help with logins, uploads, PBC lists, document review, trial balance, and notifications.`,
    },
  ];

  private typingTimer: ReturnType<typeof setInterval> | null = null;

  ngAfterViewChecked(): void {
    if (this.isOpen && this.messagesEl) {
      this.messagesEl.nativeElement.scrollTop = this.messagesEl.nativeElement.scrollHeight;
    }
  }

  onSubmit(): void {
    const prompt = this.inputValue.trim();
    if (!prompt) return;
    this.inputValue = '';
    this.addExchange(prompt);
  }

  addExchange(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const timestamp = Date.now();
    const userMessage: SupportChatMessage = { id: `support-user-${timestamp}`, role: 'user', content: trimmed };
    const assistantId = `support-assistant-${timestamp}`;
    const assistantMessage: SupportChatMessage = { id: assistantId, role: 'assistant', content: '', isTyping: true };
    this.messages = [...this.messages, userMessage, assistantMessage];

    if (this.typingTimer !== null) clearInterval(this.typingTimer);
    const fullReply = getSupportChatReply(trimmed);
    let index = 0;

    this.typingTimer = setInterval(() => {
      index += 2;
      const nextContent = fullReply.slice(0, index);
      const isComplete = index >= fullReply.length;
      this.messages = this.messages.map((m) =>
        m.id === assistantId ? { ...m, content: nextContent, isTyping: !isComplete } : m,
      );
      if (isComplete && this.typingTimer !== null) {
        clearInterval(this.typingTimer);
        this.typingTimer = null;
      }
    }, 18);
  }
}
