StableBlock — portable 版の使い方
=================================

1. この zip を右クリック →「すべて展開」で、フォルダごと取り出してください。
   zip を開いたまま中の StableBlock.exe を直接実行すると、必要なファイル
   (_internal フォルダ)が揃わず起動に失敗します。

2. 展開してできた StableBlock フォルダの中の StableBlock.exe を実行します。
   画面はブラウザ版の stableblock.html と同じです。「.sb 読込」で図を開き、
   「.sb 保存」や SVG / PNG / Excel / Mermaid の書き出しでは保存先を選ぶ窓が出ます。

3. 窓の表示には Microsoft Edge WebView2 ランタイムを使います(Windows 10 / 11 には
   通常入っています)。起動しないときは WebView2 ランタイムを入れてください。

うまく起動しないとき
--------------------
理由が次のファイルに残ります。中身を添えて知らせてください。

    %LOCALAPPDATA%\StableBlock\crash.log

インストーラ版(StableBlock-<版>-setup.exe)もあります。
アンインストールは、展開したフォルダを消すだけです。
