
# Coach Portal - Project Rules

## UI Rules

- Never use em dashes anywhere in the UI. Use a regular hyphen (-) or reword the text instead. This applies to all components, labels, placeholders, and any other visible text throughout the site.
- Always display dates and times in Europe/Dublin timezone (GMT in winter, IST/GMT+1 in summer). Label scheduled times with "(Dublin time)" where shown.
- Use existing CSS variables and BEM naming conventions throughout all components.
- Use DM Sans for both headings and body text.

## Data Rules

- All database tables include coach_id.
- All scheduled messages and posts must be persisted to the database immediately on creation - never held in memory.
- Soft delete only on scheduled posts - never hard delete.
- Update docs/logic.md whenever new logic decisions are made, including timezone handling, scheduler mechanisms, delete/recovery patterns, and API integration details.

## Workflow

- Never apply changes mid-conversation without explicit confirmation. "Want me to apply?" requires a yes before proceeding.

## Security

- Never hardcode secrets or API keys in source files. All credentials live in the .env file.
- Never deploy automatically. All deployments are manual.

## Credentials Reference

All API credentials are stored in `.env`. Do not duplicate them elsewhere.

### Typeform Links

- Weekly check-in form (Executive Check-in): https://form.typeform.com/to/n3gubYfj
- End of Month Report: https://form.typeform.com/to/iISVFuRv

### Trainerize Webhook

- Webhook URL: https://dashboard.myfitcoach.ie/webhooks/trainerize

## Trainerize API

- Use the existing Trainerize auth pattern already in the codebase for all API calls.
- Check trainerize/Webhook_api.md for exact endpoint shapes before building - do not guess field names.
- Trainerize API calls from the Client View tabs are read-only - no writes via the portal except through Coach's Corner messaging.
- Fail gracefully on all Trainerize API calls - surface errors clearly, never crash the page.
