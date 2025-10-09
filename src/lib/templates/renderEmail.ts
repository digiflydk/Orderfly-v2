import 'server-only';
import Handlebars from 'handlebars';
type TemplateVars = Record<string, unknown>;
export function renderEmail(templateSource: string, vars: TemplateVars) {
  const tpl = Handlebars.compile(templateSource, { noEscape: true });
  return tpl(vars);
}
