/**
 * Input components, reachable WITHOUT pulling in the panel shell.
 *
 * WHY THIS ENTRY EXISTS. `src/index.ts` is the application: importing anything
 * from it evaluates the shell, which imports `virtual:mercur/routes`, which
 * imports every host route page. A host page that imports a component from the
 * package barrel therefore closes a cycle back onto itself —
 *
 *   virtual:mercur/routes → routes/settings/kyc/page.tsx
 *                         → @mercurjs/vendor (shell)
 *                         → virtual:mercur/routes
 *
 * — and the routes module names its components at MODULE SCOPE, so whichever
 * side loses the ordering race throws `Cannot access 'RouteComponent20' before
 * initialization`. It survives a production build only because the bundler
 * happens to order the page first; under HMR the order flips, the virtual
 * module dies on reload, and the panel goes blank until a manual refresh. That
 * is what the dfactories vendor panel did on every edit to its KYC page.
 *
 * A host page wanting an input should reach it here, not through the barrel.
 */
export { JalaliDatePicker } from './components/inputs/jalali-date-picker'
export type { JalaliDatePickerProps } from './components/inputs/jalali-date-picker'
