import app from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`Audit API running on port ${env.port}`);
});
