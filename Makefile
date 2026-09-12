SHELL := /bin/sh

.DEFAULT_GOAL := help

ROOZNEGAAR_COMPOSE := docker compose --project-name usefulapps-rooznegaar --file apps/rooznegaar/docker-compose.yml
IDEAVAULT_COMPOSE := docker compose --project-name usefulapps-ideavault --file apps/ideavault/docker-compose.yml
SCOREBOARD_COMPOSE := docker compose --project-name usefulapps-scoreboard --file apps/scoreboard/docker-compose.yml

.PHONY: help rooznegaar rooznegaar-down scoreboard scoreboard-down ideavault ideavault-down

help: ## Show the available commands.
	@printf '%s\n' \
		'UsefulApps commands:' \
		'' \
		'  make rooznegaar PORT=3001     Build and run Rooznegaar on port 3001' \
		'  make rooznegaar-down          Stop Rooznegaar' \
		'  make scoreboard PORT=3000     Build and run Scoreboard on port 3000' \
		'  make scoreboard-down          Stop Scoreboard' \
		'' \
		'  make ideavault PORT=3002      Build and run IdeaVault on port 3002' \
		'  make ideavault-down           Stop IdeaVault; preserve your library' \
		'' \
		'PORT is required and must be an integer from 1 through 65535.'

rooznegaar: ## Build and run Rooznegaar. Usage: make rooznegaar PORT=3001
	@$(MAKE) --no-print-directory validate-port APP_NAME=rooznegaar
	@APP_PORT=$(PORT) $(ROOZNEGAAR_COMPOSE) up --detach --build
	@printf 'Rooznegaar is available at http://localhost:%s\n' '$(PORT)'

rooznegaar-down: ## Stop and remove the Rooznegaar container and network; preserve data.
	@APP_PORT=1 $(ROOZNEGAAR_COMPOSE) down

scoreboard: ## Build and run Scoreboard. Usage: make scoreboard PORT=3000
	@$(MAKE) --no-print-directory validate-port APP_NAME=scoreboard
	@APP_PORT=$(PORT) $(SCOREBOARD_COMPOSE) up --detach --build
	@printf 'Scoreboard is available at http://localhost:%s\n' '$(PORT)'

scoreboard-down: ## Stop and remove the Scoreboard container and network; preserve data.
	@APP_PORT=1 $(SCOREBOARD_COMPOSE) down

.PHONY: validate-port
validate-port:
	@case '$(PORT)' in \
		''|*[!0-9]*) printf 'Error: PORT must be a number. Example: make %s PORT=3000\n' '$(APP_NAME)' >&2; exit 2 ;; \
		*) if [ '$(PORT)' -lt 1 ] || [ '$(PORT)' -gt 65535 ]; then \
			printf 'Error: PORT must be between 1 and 65535.\n' >&2; exit 2; \
		fi ;; \
	esac

ideavault: ## Build and run IdeaVault. Usage: make ideavault PORT=3002
	@$(MAKE) --no-print-directory validate-port APP_NAME=ideavault
	@APP_PORT=$(PORT) $(IDEAVAULT_COMPOSE) up --detach --build
	@printf 'IdeaVault is available at http://localhost:%s\n' '$(PORT)'

ideavault-down: ## Stop IdeaVault and preserve its SQLite volume.
	@APP_PORT=1 $(IDEAVAULT_COMPOSE) down
