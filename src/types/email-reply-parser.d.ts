// Minimal type shim for email-reply-parser (no published @types package).
declare module "email-reply-parser" {
  export interface Fragment {
    getContent(): string;
    isHidden(): boolean;
    isSignature(): boolean;
    isQuoted(): boolean;
  }
  export interface ParsedEmail {
    getFragments(): Fragment[];
    getVisibleText(): string;
  }
  export default class EmailReplyParser {
    read(text: string): ParsedEmail;
  }
}
