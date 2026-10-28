@echo off
echo ========================================================
echo   [1/2] Syncing to GitHub...
echo ========================================================
git add .
git commit -m "update project: %date% %time%"
git push

echo.
echo ========================================================
echo   [2/2] Deploying to Netlify (Existing Site)...
echo ========================================================
npx netlify deploy --prod --dir=public --site c1d90cfc-edaf-4aa1-987f-a8566c0c142f

echo.
echo ========================================================
echo   All Done! GitHub & Netlify are up to date!
echo ========================================================
pause