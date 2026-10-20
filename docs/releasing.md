# Как самому выпустить релиз Recall

Все команды ниже — для **PowerShell на Windows**, из рабочей папки исходников `D:\AI\Flashcards`. На другом компьютере подставь путь к своей копии репозитория. Нужны Git и Node.js 24 или новее.

Выполняй команды по порядку. Если команда завершилась ошибкой, исправь её перед следующим шагом.

## 1. Один раз установить GitHub CLI и войти

```powershell
winget install --id GitHub.cli --source winget
```

Закрой и снова открой PowerShell, чтобы команда `gh` появилась в системе. Затем:

```powershell
gh auth login
```

Выбери **GitHub.com → HTTPS → вход через браузер** и войди в MantyZOR. Это отдельный вход для GitHub CLI. [Установка CLI](https://github.com/cli/cli/blob/trunk/docs/install_windows.md) · [Команда входа](https://cli.github.com/manual/gh_auth_login).

## 2. Открыть проект и выбрать новую версию

```powershell
Set-Location 'D:\AI\Flashcards'
git switch main
git pull --ff-only
npm ci
npm version patch --no-git-tag-version
```

- `git pull` получает изменения исходников с GitHub.
- `npm ci` устанавливает зависимости по сохранённому файлу версий.
- `npm version patch` повышает номер: например, **0.1.0 → 0.1.1**. Для более крупного обновления можно заменить `patch` на `minor`.
- `--no-git-tag-version` позволяет сохранить итоговый код и поставить метку вручную после сборки. [Как работает npm version](https://docs.npmjs.com/cli/v11/commands/npm-version/).

Повышай номер один раз на выпуск. Если пришлось исправить ошибку сборки, продолжай с уже выбранным номером.

## 3. Собрать приложение и проверить его

```powershell
npm run build
npm run build:web
npm run build:launcher
npm run package:portable
npm test
npm run test:e2e
```

- `build` собирает интерфейс, справку и файлы для работы без сети.
- `build:web` готовит отдельную веб-версию и её офлайн-кэш; она нужна и для браузерных проверок.
- `build:launcher` создаёт меню **Recall.exe**.
- `package:portable` создаёт **out/Recall-portable-win-x64.zip** с Node.js и необходимыми зависимостями.
- `test` проверяет расчёты, данные, службу и уже собранный переносимый пакет.
- `test:e2e` проверяет сценарии в браузере. Запускай эти две проверки последовательно.

Если браузер для тестов ещё не установлен, сначала выполни `npx playwright install chromium`, затем повтори `npm run test:e2e`.

В ZIP не входят личные карточки, базы и сертификаты. Папку готовой сборки в `out` используй для выпуска; своими исходниками управляй в основной папке проекта.

## 4. Сохранить исходники и поставить метку версии

```powershell
$recallVersion = (Get-Content .\package.json -Raw | ConvertFrom-Json).version
$recallTag = "v$recallVersion"
git add .
git diff --cached --stat
```

Посмотри список подготовленных файлов: там должны быть исходники и документация. Личные `data`, `certs`, зависимости, инструменты и готовый `out` исключены через `.gitignore`.

Затем:

```powershell
git commit -m "Release $recallTag"
git tag -a $recallTag -m "Recall $recallTag"
git push origin main
git push origin $recallTag
```

`commit` сохраняет изменения, `tag` отмечает код этой версии, две команды `push` отправляют код и метку в GitHub.

## 5. Создать черновик релиза и прикрепить ZIP

В следующей команде замени описание изменений своим текстом:

```powershell
gh release create $recallTag .\out\Recall-portable-win-x64.zip --verify-tag --draft --title "Recall $recallVersion" --notes "Обновлена справка и исправлены ошибки"
gh release view $recallTag --web
```

`create` создаёт черновик и прикрепляет готовый ZIP. `--verify-tag` проверяет, что метка уже отправлена в GitHub. `view --web` открывает страницу для проверки описания и файла. [Описание команды](https://cli.github.com/manual/gh_release_create).

## 6. Опубликовать

```powershell
gh release edit $recallTag --draft=false --latest
gh release view $recallTag --web
```

Первая команда делает выпуск доступным всем и отмечает его как последний. Вторая открывает опубликованную страницу. Скачай ZIP и проверь запуск в отдельной папке. [Публикация черновика](https://cli.github.com/manual/gh_release_edit).

Чтобы обновить также веб-страницу для прямого обмена:

```powershell
npm run publish:web
```

Она публикует только собранное приложение в ветку `gh-pages`. Данные пользователей туда не входят. Через несколько минут проверь [веб-версию Recall](https://mantyzor.github.io/Recall/).

Для следующих выпусков повторяй шаги **2–6**.

## Если нужно только обновить текст на GitHub

Для изменения README или документации достаточно коммита и `git push origin main`. Пересобирать приложение и создавать новую версию для этого не требуется.
