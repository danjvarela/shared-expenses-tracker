export interface IUnitOfWork<TRepos> {
	run<T>(fn: (repos: TRepos) => Promise<T>): Promise<T>;
}
