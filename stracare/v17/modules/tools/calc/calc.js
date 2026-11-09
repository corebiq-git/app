class Calculator {
            constructor(previousOperandTextElement, currentOperandTextElement) {
                this.previousOperandTextElement = previousOperandTextElement;
                this.currentOperandTextElement = currentOperandTextElement;
                this.clear();
            }

            clear() {
                this.currentOperand = '0';
                this.previousOperand = '';
                this.operation = undefined;
                this.updateDisplay();
            }

            delete() {
                if (this.currentOperand === '0') return;
                this.currentOperand = this.currentOperand.toString().slice(0, -1);
                if (this.currentOperand === '') this.currentOperand = '0';
                this.updateDisplay();
            }

            appendNumber(number) {
                if (number === '.' && this.currentOperand.includes('.')) return;
                if (this.currentOperand === '0' && number !== '.') {
                    this.currentOperand = number.toString();
                } else {
                    if(this.currentOperand.length < 12) {
                        this.currentOperand = this.currentOperand.toString() + number.toString();
                    }
                }
                this.updateDisplay();
            }

            chooseOperation(operation) {
                if (operation === '%') {
                    if (this.currentOperand === '0') return;
                    this.currentOperand = (parseFloat(this.currentOperand) / 100).toString();
                    this.updateDisplay();
                    return;
                }

                if (this.currentOperand === '0' && this.previousOperand === '' && operation !== '-') return;
                if (this.previousOperand !== '') {
                    this.compute();
                }
                this.operation = operation;
                this.previousOperand = this.currentOperand;
                this.currentOperand = '0';
                this.updateDisplay();
            }

            compute() {
                let computation;
                const prev = parseFloat(this.previousOperand);
                const current = parseFloat(this.currentOperand);
                
                if (isNaN(prev) || isNaN(current)) return;
                
                switch (this.operation) {
                    case '+': computation = prev + current; break;
                    case '-': computation = prev - current; break;
                    case '×': computation = prev * current; break;
                    case '÷':
                        if (current === 0) {
                            alert("Cannot divide by zero");
                            this.clear();
                            return;
                        }
                        computation = prev / current;
                        break;
                    default: return;
                }
                
                // Fix floating point precision
                this.currentOperand = Math.round(computation * 10000000000) / 10000000000;
                this.operation = undefined;
                this.previousOperand = '';
                this.updateDisplay();
            }

            getDisplayNumber(number) {
                const stringNumber = number.toString();
                const integerDigits = parseFloat(stringNumber.split('.')[0]);
                const decimalDigits = stringNumber.split('.')[1];
                let integerDisplay;
                
                if (isNaN(integerDigits)) {
                    integerDisplay = '0';
                } else {
                    // Includes comma separation for thousands (e.g. 1,862)
                    integerDisplay = integerDigits.toLocaleString('en', { maximumFractionDigits: 0 });
                }
                
                if (decimalDigits != null) {
                    return `${integerDisplay}.${decimalDigits}`;
                } else {
                    return integerDisplay;
                }
            }

            updateDisplay() {
                this.currentOperandTextElement.innerText = this.getDisplayNumber(this.currentOperand);
                if (this.operation != null) {
                    this.previousOperandTextElement.innerText = `${this.getDisplayNumber(this.previousOperand)} ${this.operation}`;
                } else {
                    this.previousOperandTextElement.innerText = '';
                }
            }
        }

        const previousOperandTextElement = document.getElementById('previous-operand');
        const currentOperandTextElement = document.getElementById('current-operand');
        const calculator = new Calculator(previousOperandTextElement, currentOperandTextElement);
        
        // Keyboard mapping for desktop usage
        document.addEventListener('keydown', e => {
            if (e.key >= 0 && e.key <= 9 || e.key === '.') calculator.appendNumber(e.key);
            if (e.key === '=' || e.key === 'Enter') { e.preventDefault(); calculator.compute(); }
            if (e.key === 'Backspace') calculator.delete();
            if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') calculator.clear();
            if (e.key === '+') calculator.chooseOperation('+');
            if (e.key === '-') calculator.chooseOperation('-');
            if (e.key === '*') calculator.chooseOperation('×');
            if (e.key === '/') calculator.chooseOperation('÷');
            if (e.key === '%') calculator.chooseOperation('%');
        });
