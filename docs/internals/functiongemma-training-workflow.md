# FunctionGemma terminal workflow

`controller/scripts/functiongemma/training/workflow.py` is the single entry
point for a candidate.  It runs the existing data, native, conversion, Q8 and
soak tools in the required order, writes `workflow-state.json` in the run
output, and pauses after every stage with a concise recommendation.

Copy `workflow.example.json` outside the repository, set the candidate paths
and data-generator command, then start from the repository root:

```bash
/media/ssd/training/functiongemma-venv/bin/python \
  controller/scripts/functiongemma/training/workflow.py \
  --spec /media/ssd/training/router-v20-recovery/run.json
```

Type `y` to run the next suitable stage automatically after a passing or review
stage. `STOP` ends the run without conversion or promotion. To resume after a
terminal closes or a correction, use `--resume`; it reads `workflow-state.json`
and starts at the first unfinished or stopped stage. To run unattended after the
operator has reviewed the plan, add `--yes`.

The Q8 server is deliberately stable: container
`subwave-functiongemma-eval`, host port **8099**, 4,096-token context, CPU
only.  The workflow replaces only that disposable evaluation container; it
does not touch a station router or any other llama.cpp service.

The intended gate order is:

1. Validate generated data and split sizes.
2. Train, then pause for the parent-versus-candidate loss review.
3. Native frozen gate.
4. Text-only source preparation and Q8 conversion.
5. Standard Q8 server.
6. Q8 controller-path gate.
7. Bounded Q8 soak.

The run specification is the durable record of hyperparameters and paths.
The generated `workflow-state.json` is the concise handover record. Full command
output is written alongside it as `workflow-command.log`; this keeps terminal and
agent output small. Do not place model checkpoints or generated corpora in Git.

For the V20/V21 acceptance history and harness lessons, see
[`functiongemma-v20-v21-findings.md`](functiongemma-v20-v21-findings.md).
