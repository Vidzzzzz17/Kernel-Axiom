# Disposable UI for CI input verification. Never targets user applications.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Axiom Automation Fixture'
$form.Width = 600
$form.Height = 400
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.AccessibleName = 'Fixture input'
$inputBox.SetBounds(30, 30, 500, 35)
$label = New-Object System.Windows.Forms.Label
$label.Text = 'Waiting for input'
$label.SetBounds(30, 90, 500, 35)
$button = New-Object System.Windows.Forms.Button
$button.Text = 'Fixture click'
$button.SetBounds(30, 150, 160, 45)
$button.Add_Click({ $label.Text = 'Click verified' })
$inputBox.Add_TextChanged({ $label.Text = $inputBox.Text })
$form.Controls.AddRange(@($inputBox, $label, $button))
$form.Add_Shown({ [Console]::WriteLine('Fixture ready: ' + $form.Handle.ToString()); $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
